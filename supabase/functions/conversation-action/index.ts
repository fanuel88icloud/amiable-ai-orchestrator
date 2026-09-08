import { createClient } from "npm:@supabase/supabase-js@2";
import { sendProviderEmail } from "../_shared/email-runtime.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "assign" | "status" | "read" | "reply" | "list_members";
type RequestBody = {
  action?: Action;
  organizationId?: string;
  conversationId?: string;
  assignedTo?: string | null;
  status?: "open" | "closed" | "handoff";
  message?: string;
  requestId?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendResendEmailReply(input: {
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
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization)
    return json({ error: "Backend o autenticazione non disponibili" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: authData } = await userClient.auth.getUser();
  if (!authData.user) return json({ error: "Sessione non valida" }, 401);

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Richiesta non valida" }, 400);
  }
  if (!body.action || !body.organizationId)
    return json({ error: "Azione e organizzazione richieste" }, 400);
  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", body.organizationId)
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return json({ error: "Accesso non consentito" }, 403);
  if (!["list_members", "read"].includes(body.action) && membership.role === "viewer")
    return json({ error: "Il ruolo osservatore non può gestire le conversazioni" }, 403);

  if (body.action === "list_members") {
    const { data: members } = await admin
      .from("organization_members")
      .select("user_id,role,status")
      .eq("organization_id", body.organizationId)
      .eq("status", "active");
    const ids = (members ?? []).map((item) => item.user_id);
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id,full_name,avatar_url").in("id", ids)
      : { data: [] };
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    return json({
      members: (members ?? []).map((member) => ({
        ...member,
        profile: profileById.get(member.user_id) ?? null,
      })),
    });
  }

  if (!body.conversationId) return json({ error: "Conversazione richiesta" }, 400);
  const { data: conversation } = await admin
    .from("channel_conversations")
    .select("*")
    .eq("id", body.conversationId)
    .eq("organization_id", body.organizationId)
    .maybeSingle();
  if (!conversation) return json({ error: "Conversazione non trovata" }, 404);

  if (body.action === "assign") {
    if (body.assignedTo) {
      const { data: target } = await admin
        .from("organization_members")
        .select("id")
        .eq("organization_id", body.organizationId)
        .eq("user_id", body.assignedTo)
        .eq("status", "active")
        .maybeSingle();
      if (!target) return json({ error: "Operatore non appartenente all’organizzazione" }, 400);
    }
    await admin
      .from("channel_conversations")
      .update({ assigned_to: body.assignedTo ?? null })
      .eq("id", conversation.id);
  } else if (body.action === "status") {
    if (!body.status) return json({ error: "Stato non valido" }, 400);
    await admin
      .from("channel_conversations")
      .update({ status: body.status })
      .eq("id", conversation.id);
  } else if (body.action === "read") {
    await admin.from("channel_conversations").update({ unread_count: 0 }).eq("id", conversation.id);
  } else if (body.action === "reply") {
    const message = body.message?.trim();
    if (!message || message.length > 4000)
      return json({ error: "Risposta vuota o troppo lunga" }, 400);
    if (!body.requestId || !/^[0-9a-f-]{36}$/i.test(body.requestId))
      return json({ error: "Identificativo risposta non valido" }, 400);
    if (conversation.status === "closed") return json({ error: "La conversazione è chiusa" }, 409);
    const { data: channel } = await admin
      .from("channels")
      .select("channel_type,provider,credentials_ref,configuration")
      .eq("id", conversation.channel_id)
      .single();
    let providerMessageId: string | null = null;
    let inReplyTo: string | null = null;
    let storedMessage = message;
    if (channel?.channel_type === "email") {
      const config = (channel.configuration ?? {}) as Record<string, unknown>;
      if (!conversation.contact_address)
        return json({ error: "Canale email non configurato" }, 409);
      const { data: lastInbound } = await admin
        .from("channel_messages")
        .select("provider_message_id,metadata")
        .eq("conversation_id", conversation.id)
        .eq("role", "user")
        .not("provider_message_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      inReplyTo = lastInbound?.provider_message_id ?? null;
      const signature = String(config.email_signature ?? "").trim();
      const outboundText = signature ? `${message}\n\n${signature}` : message;
      storedMessage = outboundText;
      try {
        if (channel.provider === "resend") {
          const apiKey = Deno.env.get(channel.credentials_ref ?? "RESEND_API_KEY");
          const fromAddress = String(config.email_from_address ?? "");
          const fromName = String(config.email_from_name ?? "").trim();
          if (!apiKey || !fromAddress) throw new Error("Canale Resend non configurato");
          providerMessageId = await sendResendEmailReply({
            apiKey,
            from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
            to: conversation.contact_address,
            subject: conversation.subject ?? "Risposta",
            text: outboundText,
            inReplyTo,
            idempotencyKey: `operator-${body.requestId}`,
          });
        } else if (["microsoft", "google", "imap"].includes(channel.provider ?? "")) {
          const { data: connection } = await admin
            .from("email_connections")
            .select("id,provider,token_expires_at,configuration")
            .eq("channel_id", conversation.channel_id)
            .eq("status", "connected")
            .maybeSingle();
          if (!connection) throw new Error("Casella email non collegata");
          const metadata = (lastInbound?.metadata ?? {}) as Record<string, unknown>;
          providerMessageId = await sendProviderEmail(
            admin,
            {
              ...connection,
              configuration: (connection.configuration ?? {}) as Record<string, unknown>,
            } as Parameters<typeof sendProviderEmail>[1],
            {
              to: conversation.contact_address,
              subject: conversation.subject ?? "Risposta",
              text: outboundText,
              providerMessageId: inReplyTo,
              providerThreadId: metadata.provider_thread_id
                ? String(metadata.provider_thread_id)
                : null,
              rfcMessageId: metadata.rfc_message_id ? String(metadata.rfc_message_id) : null,
            },
          );
        } else {
          throw new Error("Provider email non supportato");
        }
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "Invio email non riuscito" },
          502,
        );
      }
    }
    await admin.from("channel_messages").insert({
      organization_id: conversation.organization_id,
      channel_id: conversation.channel_id,
      conversation_id: conversation.id,
      role: "operator",
      content: storedMessage,
      sender_user_id: authData.user.id,
      provider_message_id: providerMessageId,
      in_reply_to: inReplyTo,
      metadata:
        channel?.channel_type === "email" ? { provider: channel.provider, delivered: true } : {},
    });
    await admin
      .from("channel_conversations")
      .update({
        status: "handoff",
        assigned_to: conversation.assigned_to ?? authData.user.id,
        unread_count: 0,
      })
      .eq("id", conversation.id);
  }

  await admin.from("audit_logs").insert({
    organization_id: body.organizationId,
    user_id: authData.user.id,
    action: `conversation.${body.action}`,
    resource_type: "conversation",
    resource_id: conversation.id,
    metadata: { assigned_to: body.assignedTo, status: body.status },
  });
  return json({ ok: true });
});
