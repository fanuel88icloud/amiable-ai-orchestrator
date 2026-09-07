import { createClient } from "npm:@supabase/supabase-js@2";

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
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    if (conversation.status === "closed") return json({ error: "La conversazione è chiusa" }, 409);
    await admin.from("channel_messages").insert({
      organization_id: conversation.organization_id,
      channel_id: conversation.channel_id,
      conversation_id: conversation.id,
      role: "operator",
      content: message,
      sender_user_id: authData.user.id,
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
