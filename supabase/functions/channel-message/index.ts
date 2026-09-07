import { createClient } from "npm:@supabase/supabase-js@2";

const baseCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-channel-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = { publicId?: string; sessionId?: string; message?: string };
type HistoryMessage = { role: "user" | "assistant"; content: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...baseCors, "Content-Type": "application/json" },
  });
}

function extractText(payload: Record<string, unknown>) {
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output
    .flatMap((item) =>
      item && typeof item === "object" && Array.isArray((item as { content?: unknown }).content)
        ? (item as { content: unknown[] }).content
        : [],
    )
    .filter(
      (item) =>
        item && typeof item === "object" && (item as { type?: string }).type === "output_text",
    )
    .map((item) => String((item as { text?: unknown }).text ?? ""))
    .join("")
    .trim();
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: baseCors });
  if (request.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !serviceKey || !openAiKey)
    return json({ error: "Runtime del canale non configurato" }, 503);
  const admin = createClient(supabaseUrl, serviceKey);

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Richiesta JSON non valida" }, 400);
  }
  const publicId = body.publicId?.trim();
  const sessionId = body.sessionId?.trim();
  const message = body.message?.trim();
  if (!publicId || !sessionId || !message)
    return json({ error: "publicId, sessionId e message sono obbligatori" }, 400);
  if (sessionId.length > 128 || message.length > 4000)
    return json({ error: "Sessione o messaggio supera i limiti consentiti" }, 400);

  const { data: channel } = await admin
    .from("channels")
    .select("*")
    .eq("public_id", publicId)
    .eq("status", "active")
    .maybeSingle();
  if (!channel || !["webchat", "api"].includes(channel.channel_type))
    return json({ error: "Canale non disponibile" }, 404);

  const configuration = (channel.configuration ?? {}) as Record<string, unknown>;
  if (channel.channel_type === "api") {
    const suppliedKey = request.headers.get("x-channel-api-key") ?? "";
    if (
      !suppliedKey ||
      !channel.api_key_hash ||
      (await sha256(suppliedKey)) !== channel.api_key_hash
    )
      return json({ error: "Chiave API non valida" }, 401);
  } else {
    const allowedOrigins = Array.isArray(configuration.allowed_origins)
      ? configuration.allowed_origins.map(String).filter(Boolean)
      : [];
    const origin = request.headers.get("Origin");
    if (allowedOrigins.length && origin && !allowedOrigins.includes(origin))
      return json({ error: "Origine webchat non autorizzata" }, 403);
  }

  if (!channel.agent_id) return json({ error: "Nessun agente associato al canale" }, 409);
  const { data: version } = await admin
    .from("agent_versions")
    .select("*")
    .eq("agent_id", channel.agent_id)
    .eq("organization_id", channel.organization_id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return json({ error: "L’agente associato non è stato pubblicato" }, 409);

  const requester =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const requesterHash = await sha256(`${channel.id}:${requester}`);
  const maxPerMinute = Math.min(
    Math.max(Number(configuration.max_requests_per_minute ?? 10), 1),
    60,
  );
  const { count } = await admin
    .from("channel_runs")
    .select("id", { count: "exact", head: true })
    .eq("channel_id", channel.id)
    .eq("requester_hash", requesterHash)
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= maxPerMinute) return json({ error: "Limite richieste raggiunto" }, 429);

  const { data: conversation, error: conversationError } = await admin
    .from("channel_conversations")
    .upsert(
      {
        organization_id: channel.organization_id,
        channel_id: channel.id,
        external_session_id: sessionId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,external_session_id" },
    )
    .select()
    .single();
  if (conversationError || !conversation)
    return json({ error: "Conversazione non disponibile" }, 500);

  const { data: history } = await admin
    .from("channel_messages")
    .select("role,content")
    .eq("conversation_id", conversation.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(30);
  await admin.from("channel_messages").insert({
    organization_id: channel.organization_id,
    channel_id: channel.id,
    conversation_id: conversation.id,
    role: "user",
    content: message,
  });

  try {
    const modelName = String(version.model_name).replace(/^openai\//, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelName,
        instructions: version.system_instructions ?? "",
        input: [...((history ?? []) as HistoryMessage[]), { role: "user", content: message }],
      }),
    });
    clearTimeout(timeout);
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const detail = payload.error as { message?: string } | undefined;
      throw new Error(detail?.message ?? "Errore del provider AI");
    }
    const answer = extractText(payload);
    if (!answer) throw new Error("Risposta vuota dal modello");
    const usage = payload.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    await admin.from("channel_messages").insert({
      organization_id: channel.organization_id,
      channel_id: channel.id,
      conversation_id: conversation.id,
      role: "assistant",
      content: answer,
      metadata: { response_id: payload.id, agent_version_id: version.id },
    });
    await admin.from("channel_runs").insert({
      organization_id: channel.organization_id,
      channel_id: channel.id,
      conversation_id: conversation.id,
      requester_hash: requesterHash,
      status: "success",
      duration_ms: Date.now() - startedAt,
      input_tokens: usage?.input_tokens,
      output_tokens: usage?.output_tokens,
    });
    return json({ answer, conversationId: conversation.id });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Errore inatteso";
    await admin.from("channel_runs").insert({
      organization_id: channel.organization_id,
      channel_id: channel.id,
      conversation_id: conversation.id,
      requester_hash: requesterHash,
      status: "error",
      duration_ms: Date.now() - startedAt,
      error_message: detail,
    });
    return json({ error: detail }, 502);
  }
});
