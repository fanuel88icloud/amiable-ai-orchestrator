import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { Webhook } from "https://esm.sh/svix@1.69.0";

type EmailEvent = {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    message_id?: string;
  };
};

type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string>;
  message_id?: string | null;
  attachments?: Array<{ id: string; filename: string; content_type: string; size?: number }>;
};

type HistoryMessage = { role: "user" | "assistant"; content: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractAddress(value: string) {
  return (
    value
      .match(/<([^>]+)>/)?.[1]
      ?.trim()
      .toLowerCase() ?? value.trim().toLowerCase()
  );
}

function extractName(value: string) {
  const name = value
    .replace(/<[^>]+>/, "")
    .trim()
    .replace(/^"|"$/g, "");
  return name && name !== value ? name : null;
}

function textFromHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSubject(value: string) {
  return value
    .replace(/^\s*((re|fw|fwd):\s*)+/gi, "")
    .trim()
    .toLowerCase();
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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendEmail(input: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
  idempotencyKey: string;
}) {
  const headers: Record<string, string> = {};
  if (input.inReplyTo) {
    headers["In-Reply-To"] = input.inReplyTo;
    headers.References = input.inReplyTo;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`,
      text: input.text,
      headers,
    }),
  });
  const payload = (await response.json()) as { id?: string; message?: string };
  if (!response.ok || !payload.id) throw new Error(payload.message ?? "Invio email non riuscito");
  return payload.id;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicId = new URL(request.url).searchParams.get("channel")?.trim();
  if (!supabaseUrl || !serviceKey || !publicId)
    return json({ error: "Endpoint non configurato" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: channel } = await admin
    .from("channels")
    .select("*")
    .eq("public_id", publicId)
    .eq("channel_type", "email")
    .eq("status", "active")
    .maybeSingle();
  if (!channel) return json({ error: "Canale non disponibile" }, 404);

  const configuration = (channel.configuration ?? {}) as Record<string, unknown>;
  const signingSecretName = String(configuration.webhook_secret_ref ?? "RESEND_WEBHOOK_SECRET");
  const signingSecret = Deno.env.get(signingSecretName);
  const apiKey = Deno.env.get(channel.credentials_ref ?? "RESEND_API_KEY");
  if (!signingSecret || !apiKey) return json({ error: "Segreti email non configurati" }, 503);

  const rawBody = await request.text();
  let event: EmailEvent;
  try {
    event = new Webhook(signingSecret).verify(rawBody, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    }) as EmailEvent;
  } catch {
    return json({ error: "Firma webhook non valida" }, 401);
  }
  if (event.type !== "email.received" || !event.data?.email_id) return json({ ok: true });

  const eventId = request.headers.get("svix-id")!;
  const { data: duplicate } = await admin
    .from("channel_messages")
    .select("id")
    .eq("channel_id", channel.id)
    .eq("provider_event_id", eventId)
    .maybeSingle();
  if (duplicate) return json({ ok: true, duplicate: true });

  const receivedResponse = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(event.data.email_id)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!receivedResponse.ok) return json({ error: "Contenuto email non disponibile" }, 502);
  const email = (await receivedResponse.json()) as ReceivedEmail;
  const inboundAddress = String(configuration.email_inbound_address ?? "").toLowerCase();
  if (inboundAddress && !email.to.map(extractAddress).includes(inboundAddress))
    return json({ error: "Destinatario non associato al canale" }, 403);

  const content = (email.text?.trim() || (email.html ? textFromHtml(email.html) : "")).slice(
    0,
    100_000,
  );
  if (!content) return json({ error: "Email senza contenuto elaborabile" }, 422);
  const sender = extractAddress(email.from);
  const inReplyTo = email.headers?.["in-reply-to"] ?? email.headers?.["In-Reply-To"] ?? null;
  let conversationId: string | null = null;
  if (inReplyTo) {
    const { data: parent } = await admin
      .from("channel_messages")
      .select("conversation_id")
      .eq("channel_id", channel.id)
      .eq("provider_message_id", inReplyTo)
      .maybeSingle();
    conversationId = parent?.conversation_id ?? null;
  }
  const threadKey = `email:${await sha256(`${sender}:${normalizeSubject(email.subject || "Senza oggetto")}`)}`;
  if (!conversationId) {
    const { data: conversation, error } = await admin
      .from("channel_conversations")
      .upsert(
        {
          organization_id: channel.organization_id,
          channel_id: channel.id,
          external_session_id: threadKey,
          contact_name: extractName(email.from),
          contact_address: sender,
          subject: email.subject || "Senza oggetto",
          metadata: { provider: "resend" },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "channel_id,external_session_id" },
      )
      .select("id,status")
      .single();
    if (error || !conversation) return json({ error: "Conversazione non disponibile" }, 500);
    conversationId = conversation.id;
  }

  const { error: messageError } = await admin.from("channel_messages").insert({
    organization_id: channel.organization_id,
    channel_id: channel.id,
    conversation_id: conversationId,
    role: "user",
    content,
    provider_message_id: email.message_id ?? event.data.message_id ?? email.id,
    provider_event_id: eventId,
    in_reply_to: inReplyTo,
    metadata: {
      provider: "resend",
      received_email_id: email.id,
      attachments: email.attachments ?? [],
    },
  });
  if (messageError?.code === "23505") return json({ ok: true, duplicate: true });
  if (messageError) return json({ error: "Email non registrata" }, 500);

  const { data: currentConversation } = await admin
    .from("channel_conversations")
    .select("status")
    .eq("id", conversationId)
    .single();
  if (currentConversation?.status === "closed") {
    await admin
      .from("channel_conversations")
      .update({ status: "handoff", handoff_reason: "Nuova email su conversazione chiusa" })
      .eq("id", conversationId);
    return json({ ok: true, conversationId, mode: "operator" });
  }
  if (currentConversation?.status === "handoff")
    return json({ ok: true, conversationId, mode: "operator" });

  if (configuration.email_reply_mode !== "automatic") {
    await admin
      .from("channel_conversations")
      .update({ status: "handoff", handoff_reason: "Canale email in gestione operatore" })
      .eq("id", conversationId);
    return json({ ok: true, conversationId, mode: "operator" });
  }

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAiKey || !channel.agent_id) {
    await admin
      .from("channel_conversations")
      .update({ status: "handoff", handoff_reason: "Agente AI email non configurato" })
      .eq("id", conversationId);
    return json({ ok: true, conversationId, mode: "operator" });
  }

  const { data: version } = await admin
    .from("agent_versions")
    .select("*")
    .eq("agent_id", channel.agent_id)
    .eq("organization_id", channel.organization_id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return json({ error: "Agente non pubblicato" }, 409);
  const { data: history } = await admin
    .from("channel_messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant", "operator"])
    .order("created_at", { ascending: true })
    .limit(30);

  const startedAt = Date.now();
  try {
    const handoffToken = "[PASSA_A_OPERATORE]";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const modelResponse = await fetch("https://api.openai.com/v1/responses", {
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
    const modelPayload = (await modelResponse.json()) as Record<string, unknown>;
    if (!modelResponse.ok) throw new Error("Generazione della risposta non riuscita");
    let answer = extractText(modelPayload);
    if (!answer) throw new Error("Risposta vuota dal modello");
    const handoffRequested = answer.includes(handoffToken);
    answer = answer.replaceAll(handoffToken, "").trim();
    const signature = String(configuration.email_signature ?? "").trim();
    const outboundText = signature ? `${answer}\n\n${signature}` : answer;
    const fromAddress = String(configuration.email_from_address ?? "");
    const fromName = String(configuration.email_from_name ?? "").trim();
    const providerId = await sendEmail({
      apiKey,
      from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
      to: sender,
      subject: email.subject || "Senza oggetto",
      text: outboundText,
      inReplyTo: email.message_id ?? event.data.message_id,
      idempotencyKey: `ai-${conversationId}-${event.data.email_id}`,
    });
    await admin.from("channel_messages").insert({
      organization_id: channel.organization_id,
      channel_id: channel.id,
      conversation_id: conversationId,
      role: "assistant",
      content: outboundText,
      provider_message_id: providerId,
      in_reply_to: email.message_id ?? event.data.message_id,
      metadata: { provider: "resend", response_id: modelPayload.id, delivered: true },
    });
    const usage = modelPayload.usage as
      { input_tokens?: number; output_tokens?: number } | undefined;
    await admin.from("channel_runs").insert({
      organization_id: channel.organization_id,
      channel_id: channel.id,
      conversation_id: conversationId,
      requester_hash: await sha256(sender),
      status: "success",
      duration_ms: Date.now() - startedAt,
      input_tokens: usage?.input_tokens,
      output_tokens: usage?.output_tokens,
    });
    if (handoffRequested)
      await admin
        .from("channel_conversations")
        .update({ status: "handoff", handoff_reason: "Richiesto dall’agente AI via email" })
        .eq("id", conversationId);
    return json({ ok: true, conversationId, mode: "automatic" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Errore inatteso";
    await admin.from("channel_runs").insert({
      organization_id: channel.organization_id,
      channel_id: channel.id,
      conversation_id: conversationId,
      requester_hash: await sha256(sender),
      status: "error",
      duration_ms: Date.now() - startedAt,
      error_message: detail,
    });
    await admin
      .from("channel_conversations")
      .update({ status: "handoff", handoff_reason: `Errore risposta email: ${detail}` })
      .eq("id", conversationId);
    return json({ ok: true, conversationId, mode: "operator", warning: detail });
  }
});
