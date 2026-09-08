import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RequestBody = { sessionId?: string; message?: string };
type ChatMessage = { role: "user" | "assistant"; content: string };
type ToolRecord = {
  id: string;
  name: string;
  description: string | null;
  tool_type: string;
  configuration: Record<string, unknown>;
  credentials_ref: string | null;
};

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

function safeToolName(name: string, id: string) {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_");
  return `${(normalized || "tool").slice(0, 55)}_${id.slice(0, 6)}`;
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:") ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

function validateArguments(schema: Record<string, unknown>, args: Record<string, unknown>) {
  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  for (const key of required)
    if (!(key in args)) throw new Error(`Parametro obbligatorio mancante: ${key}`);
  if (
    schema.additionalProperties === false &&
    schema.properties &&
    typeof schema.properties === "object"
  ) {
    const allowed = new Set(Object.keys(schema.properties as Record<string, unknown>));
    for (const key of Object.keys(args))
      if (!allowed.has(key)) throw new Error(`Parametro non previsto: ${key}`);
  }
}

async function executeHttpTool(tool: ToolRecord, args: Record<string, unknown>) {
  if (tool.tool_type !== "api" && tool.tool_type !== "webhook")
    throw new Error(`Il tipo ${tool.tool_type} non è ancora eseguibile`);
  const config = tool.configuration ?? {};
  const url = new URL(String(config.url ?? ""));
  if (url.protocol !== "https:" || isPrivateHost(url.hostname))
    throw new Error("Endpoint tool non consentito");
  const method = String(config.method ?? "POST").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method))
    throw new Error("Metodo HTTP non consentito");
  validateArguments((config.input_schema ?? {}) as Record<string, unknown>, args);
  const headers = new Headers({ "Content-Type": "application/json" });
  const configuredHeaders = (config.headers ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(configuredHeaders)) {
    if (/authorization|api-key|token|secret/i.test(key)) continue;
    headers.set(key, String(value));
  }
  if (tool.credentials_ref) {
    const secret = Deno.env.get(tool.credentials_ref);
    if (!secret) throw new Error(`Segreto ${tool.credentials_ref} non configurato`);
    headers.set("Authorization", `Bearer ${secret}`);
  }
  const target = new URL(url);
  const init: RequestInit = { method, headers };
  if (method === "GET")
    Object.entries(args).forEach(([key, value]) => target.searchParams.set(key, String(value)));
  else init.body = JSON.stringify(args);
  const timeoutMs = Math.min(Math.max(Number(config.timeout_ms ?? 15000), 1000), 30000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(target, { ...init, signal: controller.signal, redirect: "error" });
  clearTimeout(timeout);
  const text = (await response.text()).slice(0, 50000);
  if (!response.ok) throw new Error(`Tool HTTP ${response.status}: ${text.slice(0, 500)}`);
  return { status: response.status, body: text };
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

  const { data: toolLinks } = await admin
    .from("agent_tools")
    .select("tool:tools(id,name,description,tool_type,configuration,credentials_ref,status)")
    .eq("agent_id", session.agent_id)
    .eq("organization_id", session.organization_id)
    .eq("is_enabled", true);
  const activeTools = (toolLinks ?? [])
    .map((link) => link.tool as unknown as (ToolRecord & { status: string }) | null)
    .filter((tool): tool is ToolRecord & { status: string } =>
      Boolean(tool && tool.status === "active"),
    );
  const toolsByName = new Map(activeTools.map((tool) => [safeToolName(tool.name, tool.id), tool]));
  const responseTools = activeTools.map((tool) => ({
    type: "function",
    name: safeToolName(tool.name, tool.id),
    description: tool.description || `Esegue ${tool.name}`,
    parameters: tool.configuration?.input_schema ?? {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    strict: false,
  }));

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
    const requestBody: Record<string, unknown> = {
      model: modelName,
      instructions,
      input: [...((history ?? []) as ChatMessage[]), { role: "user", content: message }],
    };
    if (responseTools.length) requestBody.tools = responseTools;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(requestBody),
    });
    clearTimeout(timeout);
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const apiError = payload.error as { message?: string } | undefined;
      throw new Error(apiError?.message ?? "Errore del provider AI");
    }
    const calls = (Array.isArray(payload.output) ? payload.output : []).filter(
      (item): item is { type: string; call_id: string; name: string; arguments: string } =>
        Boolean(
          item && typeof item === "object" && (item as { type?: string }).type === "function_call",
        ),
    );
    const toolResults: Array<Record<string, unknown>> = [];
    let finalPayload = payload;
    if (calls.length) {
      const outputs = [];
      for (const call of calls.slice(0, 5)) {
        const tool = toolsByName.get(call.name);
        const toolStartedAt = Date.now();
        try {
          if (!tool) throw new Error("Tool non associato o inattivo");
          const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
          const result = await executeHttpTool(tool, args);
          const toolDurationMs = Date.now() - toolStartedAt;
          outputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(result),
          });
          toolResults.push({
            tool_id: tool.id,
            name: tool.name,
            status: "success",
            duration_ms: toolDurationMs,
          });
          await admin.from("audit_logs").insert({
            organization_id: session.organization_id,
            user_id: authData.user.id,
            action: "tool.execution.succeeded",
            resource_type: "tool",
            resource_id: tool.id,
            metadata: {
              agent_id: session.agent_id,
              session_id: sessionId,
              duration_ms: toolDurationMs,
              http_status: result.status,
            },
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Errore tool";
          const toolDurationMs = Date.now() - toolStartedAt;
          outputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({ error: detail }),
          });
          toolResults.push({
            tool_id: tool?.id,
            name: tool?.name ?? call.name,
            status: "error",
            error: detail,
            duration_ms: toolDurationMs,
          });
          if (tool) {
            await admin.from("audit_logs").insert({
              organization_id: session.organization_id,
              user_id: authData.user.id,
              action: "tool.execution.failed",
              resource_type: "tool",
              resource_id: tool.id,
              metadata: {
                agent_id: session.agent_id,
                session_id: sessionId,
                duration_ms: toolDurationMs,
                error_type:
                  error instanceof DOMException && error.name === "AbortError"
                    ? "timeout"
                    : "execution_error",
              },
            });
          }
        }
      }
      const followUp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          previous_response_id: payload.id,
          input: outputs,
        }),
      });
      finalPayload = (await followUp.json()) as Record<string, unknown>;
      if (!followUp.ok)
        throw new Error("Impossibile completare la risposta dopo l’esecuzione del tool");
    }
    const answer = outputText(finalPayload);
    if (!answer) throw new Error("Il modello non ha restituito testo");
    const firstUsage = payload.usage as
      { input_tokens?: number; output_tokens?: number } | undefined;
    const finalUsage =
      finalPayload === payload
        ? undefined
        : (finalPayload.usage as { input_tokens?: number; output_tokens?: number } | undefined);
    const usage = {
      input_tokens: (firstUsage?.input_tokens ?? 0) + (finalUsage?.input_tokens ?? 0),
      output_tokens: (firstUsage?.output_tokens ?? 0) + (finalUsage?.output_tokens ?? 0),
    };
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
        metadata: { response_id: finalPayload.id, tool_results: toolResults },
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
