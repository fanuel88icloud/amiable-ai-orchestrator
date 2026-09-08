import { createClient } from "npm:@supabase/supabase-js@2";
import {
  listProviderMessages,
  sendProviderEmail,
  type ProviderMessage,
} from "../_shared/email-runtime.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-email-sync-secret",
};

type HistoryMessage = { role: "user" | "assistant"; content: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++)
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
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

async function automaticReply(
  admin: ReturnType<typeof createClient>,
  channel: Record<string, unknown>,
  connection: Record<string, unknown>,
  conversationId: string,
  inbound: ProviderMessage,
) {
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const agentId = channel.agent_id ? String(channel.agent_id) : "";
  if (!openAiKey || !agentId) throw new Error("Agente AI email non configurato");
  const { data: version } = await admin
    .from("agent_versions")
    .select("*")
    .eq("agent_id", agentId)
    .eq("organization_id", String(channel.organization_id))
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) throw new Error("Agente associato non pubblicato");
  const { data: history } = await admin
    .from("channel_messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant", "operator"])
    .order("created_at", { ascending: true })
    .limit(30);
  const handoffToken = "[PASSA_A_OPERATORE]";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      model: String(version.model_name).replace(/^openai\//, ""),
      instructions: `${version.system_instructions ?? ""}\nRispondi come email in testo semplice. Se serve un operatore umano termina con ${handoffToken}.`,
      input: (history ?? []).map((item) => ({
        role: item.role === "operator" ? "assistant" : item.role,
        content: item.content,
      })) as HistoryMessage[],
    }),
  });
  clearTimeout(timeout);
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error("Generazione della risposta non riuscita");
  let answer = extractText(payload);
  if (!answer) throw new Error("Risposta vuota dal modello");
  const handoffRequested = answer.includes(handoffToken);
  answer = answer.replaceAll(handoffToken, "").trim();
  if (handoffRequested) {
    await admin
      .from("channel_conversations")
      .update({ status: "handoff", handoff_reason: "Richiesto dall’agente AI via email" })
      .eq("id", conversationId);
    return false;
  }
  const configuration = (channel.configuration ?? {}) as Record<string, unknown>;
  const signature = String(configuration.email_signature ?? "").trim();
  const outbound = signature ? `${answer}\n\n${signature}` : answer;
  const providerId = await sendProviderEmail(
    admin,
    connection as Parameters<typeof sendProviderEmail>[1],
    {
      to: inbound.fromAddress,
      subject: inbound.subject,
      text: outbound,
      providerMessageId: inbound.providerMessageId,
      providerThreadId: inbound.providerThreadId,
      rfcMessageId: inbound.rfcMessageId,
    },
  );
  await admin.from("channel_messages").insert({
    organization_id: channel.organization_id,
    channel_id: channel.id,
    conversation_id: conversationId,
    role: "assistant",
    content: outbound,
    provider_message_id: providerId,
    in_reply_to: inbound.providerMessageId,
    metadata: {
      provider: connection.provider,
      provider_thread_id: inbound.providerThreadId,
      response_id: payload.id,
      delivered: true,
    },
  });
  return true;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  const expectedSyncSecret = Deno.env.get("EMAIL_SYNC_SECRET") ?? "";
  const suppliedSyncSecret = request.headers.get("x-email-sync-secret") ?? "";
  const internalRequest = constantTimeEqual(suppliedSyncSecret, expectedSyncSecret);
  if (!supabaseUrl || !serviceKey || (!internalRequest && (!anonKey || !authorization)))
    return json({ error: "Backend o autenticazione non disponibili" }, 401);
  const admin = createClient(supabaseUrl, serviceKey);
  const body = (await request.json().catch(() => null)) as {
    organizationId?: string;
    channelId?: string;
  } | null;
  if (!body?.organizationId || !body.channelId)
    return json({ error: "Organizzazione e canale richiesti" }, 400);
  if (!internalRequest) {
    const userClient = createClient(supabaseUrl, anonKey!, {
      global: { headers: { Authorization: authorization! } },
    });
    const { data: authData } = await userClient.auth.getUser();
    if (!authData.user) return json({ error: "Sessione non valida" }, 401);
    const { data: membership } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", body.organizationId)
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership) return json({ error: "Accesso non consentito" }, 403);
  }
  const { data: channel } = await admin
    .from("channels")
    .select("*")
    .eq("id", body.channelId)
    .eq("organization_id", body.organizationId)
    .eq("channel_type", "email")
    .maybeSingle();
  const { data: connection } = await admin
    .from("email_connections")
    .select("*")
    .eq("channel_id", body.channelId)
    .eq("organization_id", body.organizationId)
    .eq("status", "connected")
    .maybeSingle();
  if (!channel || !connection || !["microsoft", "google"].includes(connection.provider))
    return json({ error: "Connessione Outlook o Gmail non disponibile" }, 409);

  const configuration = (connection.configuration ?? {}) as Record<string, unknown>;
  const since = String(
    connection.last_sync_at ??
      connection.connected_at ??
      new Date(Date.now() - 300_000).toISOString(),
  );
  try {
    const messages = await listProviderMessages(
      admin,
      { ...connection, configuration } as Parameters<typeof listProviderMessages>[1],
      since,
    );
    let imported = 0;
    let replied = 0;
    for (const inbound of messages) {
      if (!inbound.providerMessageId || !inbound.fromAddress || !inbound.text) continue;
      const { data: duplicate } = await admin
        .from("channel_messages")
        .select("id")
        .eq("channel_id", channel.id)
        .eq("provider_message_id", inbound.providerMessageId)
        .maybeSingle();
      if (duplicate) continue;
      const externalSessionId = `email:${connection.provider}:${inbound.providerThreadId ?? inbound.providerMessageId}`;
      const { data: conversation, error: conversationError } = await admin
        .from("channel_conversations")
        .upsert(
          {
            organization_id: channel.organization_id,
            channel_id: channel.id,
            external_session_id: externalSessionId,
            contact_name: inbound.fromName,
            contact_address: inbound.fromAddress,
            subject: inbound.subject,
            metadata: {
              provider: connection.provider,
              provider_thread_id: inbound.providerThreadId,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "channel_id,external_session_id" },
        )
        .select("id,status")
        .single();
      if (conversationError || !conversation) throw new Error("Conversazione non disponibile");
      const { error: insertError } = await admin.from("channel_messages").insert({
        organization_id: channel.organization_id,
        channel_id: channel.id,
        conversation_id: conversation.id,
        role: "user",
        content: inbound.text,
        provider_message_id: inbound.providerMessageId,
        in_reply_to: null,
        created_at: inbound.receivedAt,
        metadata: {
          provider: connection.provider,
          provider_thread_id: inbound.providerThreadId,
          rfc_message_id: inbound.rfcMessageId,
        },
      });
      if (insertError?.code === "23505") continue;
      if (insertError) throw new Error("Email non registrata");
      imported++;
      if (conversation.status === "closed") {
        await admin
          .from("channel_conversations")
          .update({ status: "handoff", handoff_reason: "Nuova email su conversazione chiusa" })
          .eq("id", conversation.id);
        continue;
      }
      const channelConfig = (channel.configuration ?? {}) as Record<string, unknown>;
      if (conversation.status === "open" && channelConfig.email_reply_mode === "automatic") {
        try {
          if (await automaticReply(admin, channel, connection, conversation.id, inbound)) replied++;
        } catch (error) {
          await admin
            .from("channel_conversations")
            .update({
              status: "handoff",
              handoff_reason: `Errore risposta email: ${error instanceof Error ? error.message : "errore inatteso"}`,
            })
            .eq("id", conversation.id);
        }
      } else if (conversation.status === "open") {
        await admin
          .from("channel_conversations")
          .update({ status: "handoff", handoff_reason: "Canale email in gestione operatore" })
          .eq("id", conversation.id);
      }
    }
    const syncedAt = new Date().toISOString();
    await admin
      .from("email_connections")
      .update({
        last_sync_at: syncedAt,
        last_error: null,
        configuration: { ...configuration, runtime_ready: true },
      })
      .eq("id", connection.id);
    return json({ ok: true, imported, replied, syncedAt });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Sincronizzazione non riuscita";
    await admin.from("email_connections").update({ last_error: detail }).eq("id", connection.id);
    return json({ error: detail }, 502);
  }
});
