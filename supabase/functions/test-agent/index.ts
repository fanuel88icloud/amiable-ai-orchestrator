import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RequestBody = { sessionId?: string; message?: string };
type ChatMessage = { role: "user" | "assistant"; content: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function outputText(response: Record<string, unknown>): string {
  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .flatMap((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        !Array.isArray((item as { content?: unknown }).content)
      )
        return [];
      return (item as { content: unknown[] }).content;
    })
    .filter(
      (item) =>
        item && typeof item === "object" && (item as { type?: string }).type === "output_text",
    )
    .map((item) => String((item as { text?: unknown }).text ?? ""))
    .join("")
    .trim();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey)
    return json({ error: "Backend non configurato" }, 500);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Autenticazione richiesta" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Sessione non valida" }, 401);

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Richiesta non valida" }, 400);
  }
  const sessionId = body.sessionId?.trim();
  const message = body.message?.trim();
  if (!sessionId || !message) return json({ error: "Sessione e messaggio sono obbligatori" }, 400);

  const { data: session } = await admin
    .from("agent_test_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("created_by", authData.user.id)
    .eq("status", "open")
    .single();
  if (!session) return json({ error: "Sessione di test non accessibile" }, 404);

  const { data: membership } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", session.organization_id)
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return json({ error: "Accesso all’organizzazione non consentito" }, 403);

  const { data: limits } = await admin
    .from("organization_limits")
    .select("*")
    .eq("organization_id", session.organization_id)
    .maybeSingle();
  const maxCharacters = limits?.max_characters_per_message ?? 4000;
  const maxMessages = limits?.max_messages_per_session ?? 40;
  const maxTestsPerMinute = limits?.max_tests_per_minute ?? 15;
  const timeoutMs = limits?.request_timeout_ms ?? 60000;
  if (message.length > maxCharacters)
    return json({ error: `Il messaggio supera ${maxCharacters} caratteri` }, 400);

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count: recentRuns } = await admin
    .from("agent_test_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", authData.user.id)
    .gte("created_at", since);
  if ((recentRuns ?? 0) >= maxTestsPerMinute)
    return json({ error: "Limite di test al minuto raggiunto" }, 429);

  const { data: history } = await admin
    .from("agent_test_messages")
    .select("role,content")
    .eq("session_id", sessionId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true });
  if ((history?.length ?? 0) >= maxMessages)
    return json({ error: "Limite messaggi della sessione raggiunto" }, 400);

  const sourceQuery = session.agent_version_id
    ? admin.from("agent_versions").select("*").eq("id", session.agent_version_id)
    : admin.from("agents").select("*").eq("id", session.agent_id);
  const { data: source } = await sourceQuery
    .eq("organization_id", session.organization_id)
    .single();
  if (!source) return json({ error: "Configurazione agente non trovata" }, 404);

  const modelName = String(source.model_name ?? "").replace(/^openai\//, "");
  const provider = String(source.model_provider ?? "openai");
  const instructions = String(source.system_instructions ?? "").trim();
  if (!modelName) return json({ error: "Seleziona un modello prima di avviare il test" }, 400);
  if (provider !== "openai")
    return json({ error: `Provider ${provider} non ancora supportato` }, 400);
  if (!openAiKey)
    return json({ error: "OPENAI_API_KEY non configurata nei segreti Supabase" }, 503);

  const { data: userMessage, error: userMessageError } = await admin
    .from("agent_test_messages")
    .insert({
      organization_id: session.organization_id,
      session_id: sessionId,
      role: "user",
      content: message,
    })
    .select()
    .single();
  if (userMessageError) return json({ error: "Impossibile salvare il messaggio" }, 500);

  let status = "error";
  let errorMessage: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let estimatedCost: number | null = null;
  let currency: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelName,
        instructions,
        input: [...((history ?? []) as ChatMessage[]), { role: "user", content: message }],
      }),
    });
    clearTimeout(timeout);
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const apiError = payload.error as { message?: string } | undefined;
      throw new Error(apiError?.message ?? "Errore del provider AI");
    }
    const answer = outputText(payload);
    if (!answer) throw new Error("Il modello non ha restituito testo");
    const usage = payload.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    inputTokens = usage?.input_tokens ?? null;
    outputTokens = usage?.output_tokens ?? null;

    const { data: model } = await admin
      .from("ai_models")
      .select("input_cost_per_million,output_cost_per_million,currency")
      .eq("provider", provider)
      .eq("model_name", source.model_name)
      .maybeSingle();
    if (model && inputTokens != null && outputTokens != null) {
      estimatedCost =
        (inputTokens * Number(model.input_cost_per_million ?? 0) +
          outputTokens * Number(model.output_cost_per_million ?? 0)) /
        1_000_000;
      currency = model.currency;
    }

    const { data: assistantMessage, error: assistantError } = await admin
      .from("agent_test_messages")
      .insert({
        organization_id: session.organization_id,
        session_id: sessionId,
        role: "assistant",
        content: answer,
        metadata: { response_id: payload.id, configured_tools_only: true },
      })
      .select()
      .single();
    if (assistantError) throw assistantError;
    status = "success";

    const { data: run } = await admin
      .from("agent_test_runs")
      .insert({
        organization_id: session.organization_id,
        agent_id: session.agent_id,
        agent_version_id: session.agent_version_id,
        session_id: sessionId,
        user_id: authData.user.id,
        provider,
        model_name: String(source.model_name),
        duration_ms: Date.now() - startedAt,
        status,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost: estimatedCost,
        currency,
      })
      .select()
      .single();
    await admin
      .from("agents")
      .update({ last_tested_at: new Date().toISOString() })
      .eq("id", session.agent_id);
    return json({ userMessage, assistantMessage, run });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Errore inatteso";
    await admin.from("agent_test_runs").insert({
      organization_id: session.organization_id,
      agent_id: session.agent_id,
      agent_version_id: session.agent_version_id,
      session_id: sessionId,
      user_id: authData.user.id,
      provider,
      model_name: String(source.model_name),
      duration_ms: Date.now() - startedAt,
      status,
      error_message: errorMessage,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: estimatedCost,
      currency,
    });
    return json({ error: errorMessage }, 502);
  }
});
