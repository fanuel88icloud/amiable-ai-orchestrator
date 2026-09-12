import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { createOAuthState, encryptSecret } from "../_shared/email-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Provider = "microsoft" | "google" | "imap" | "resend";
type RequestBody = {
  action?: "status" | "oauth_start" | "configure_imap" | "verify_imap" | "disconnect";
  organizationId?: string;
  channelId?: string;
  provider?: Provider;
  emailAddress?: string;
  displayName?: string;
  password?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecurity?: "tls" | "starttls";
  smtpHost?: string;
  smtpPort?: number;
  smtpSecurity?: "tls" | "starttls";
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
  if (!body.action || !body.organizationId || !body.channelId)
    return json({ error: "Azione, organizzazione e canale richiesti" }, 400);
  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", body.organizationId)
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return json({ error: "Accesso non consentito" }, 403);
  const { data: channel } = await admin
    .from("channels")
    .select("id,organization_id,channel_type")
    .eq("id", body.channelId)
    .eq("organization_id", body.organizationId)
    .eq("channel_type", "email")
    .maybeSingle();
  if (!channel) return json({ error: "Canale email non trovato" }, 404);

  if (body.action === "status") {
    const { data: connection } = await admin
      .from("email_connections")
      .select(
        "id,provider,auth_method,email_address,display_name,status,configuration,token_expires_at,last_sync_at,last_error,connected_at",
      )
      .eq("channel_id", channel.id)
      .maybeSingle();
    return json({ connection });
  }
  if (membership.role === "viewer" || membership.role === "operator")
    return json({ error: "Il ruolo non può modificare le connessioni email" }, 403);

  if (body.action === "disconnect") {
    await admin.from("email_connections").delete().eq("channel_id", channel.id);
    await admin
      .from("channels")
      .update({ provider: null, credentials_ref: null, status: "draft" })
      .eq("id", channel.id);
    await admin.from("audit_logs").insert({
      organization_id: body.organizationId,
      user_id: authData.user.id,
      action: "email_connection.disconnected",
      resource_type: "channel",
      resource_id: channel.id,
    });
    return json({ ok: true });
  }

  if (body.action === "oauth_start") {
    if (!body.provider || !["microsoft", "google"].includes(body.provider))
      return json({ error: "Provider OAuth non valido" }, 400);
    const callbackUrl = `${supabaseUrl}/functions/v1/email-oauth-callback`;
    const state = await createOAuthState({
      provider: body.provider,
      organizationId: body.organizationId,
      channelId: channel.id,
      userId: authData.user.id,
      nonce: crypto.randomUUID(),
      expiresAt: Date.now() + 10 * 60_000,
    });
    let authorizationUrl: URL;
    if (body.provider === "microsoft") {
      const clientId = Deno.env.get("MICROSOFT_CLIENT_ID");
      if (!clientId) return json({ error: "Connessione Microsoft non configurata" }, 503);
      authorizationUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
      authorizationUrl.search = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: callbackUrl,
        response_mode: "query",
        scope: "openid profile email offline_access User.Read Mail.Read Mail.Send",
        state,
        prompt: "select_account",
      }).toString();
    } else {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      if (!clientId) return json({ error: "Connessione Google non configurata" }, 503);
      authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorizationUrl.search = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: callbackUrl,
        scope:
          "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
        access_type: "offline",
        include_granted_scopes: "true",
        prompt: "consent select_account",
        state,
      }).toString();
    }
    return json({ authorizationUrl: authorizationUrl.toString() });
  }

  if (body.action === "configure_imap") {
    const email = body.emailAddress?.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !body.password)
      return json({ error: "Email e password per applicazioni richieste" }, 400);
    if (!body.imapHost || !body.smtpHost || !body.imapPort || !body.smtpPort)
      return json({ error: "Parametri IMAP e SMTP incompleti" }, 400);
    const validHostname = (value: string) =>
      value.length <= 253 &&
      /^(?=.{1,253}$)(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value) &&
      !value.toLowerCase().endsWith(".local");
    if (!validHostname(body.imapHost.trim()) || !validHostname(body.smtpHost.trim()))
      return json({ error: "Server IMAP o SMTP non valido" }, 400);
    if (
      !Number.isInteger(body.imapPort) ||
      body.imapPort < 1 ||
      body.imapPort > 65535 ||
      !Number.isInteger(body.smtpPort) ||
      body.smtpPort < 1 ||
      body.smtpPort > 65535
    )
      return json({ error: "Porta IMAP o SMTP non valida" }, 400);
    const { data: connection, error } = await admin
      .from("email_connections")
      .upsert(
        {
          organization_id: body.organizationId,
          channel_id: channel.id,
          provider: "imap",
          auth_method: "password",
          email_address: email,
          display_name: body.displayName?.trim() || null,
          status: "pending",
          configuration: {
            imap_host: body.imapHost.trim(),
            imap_port: body.imapPort,
            imap_security: body.imapSecurity ?? "tls",
            smtp_host: body.smtpHost.trim(),
            smtp_port: body.smtpPort,
            smtp_security: body.smtpSecurity ?? "tls",
            runtime_ready: false,
          },
          connected_by: authData.user.id,
          last_error: null,
        },
        { onConflict: "channel_id" },
      )
      .select("id")
      .single();
    if (error || !connection) return json({ error: "Connessione non salvata" }, 500);
    const encrypted = await encryptSecret({ username: email, password: body.password });
    const { error: secretError } = await admin.from("email_connection_secrets").upsert({
      connection_id: connection.id,
      encrypted_payload: encrypted.encryptedPayload,
      initialization_vector: encrypted.initializationVector,
      updated_at: new Date().toISOString(),
    });
    if (secretError) {
      await admin
        .from("email_connections")
        .update({ status: "error", last_error: "Credenziali non salvate" })
        .eq("id", connection.id);
      return json({ error: "Credenziali email non protette" }, 500);
    }
    const { error: channelError } = await admin
      .from("channels")
      .update({ provider: "imap" })
      .eq("id", channel.id);
    if (channelError) return json({ error: "Canale email non aggiornato" }, 500);
    await admin.from("audit_logs").insert({
      organization_id: body.organizationId,
      user_id: authData.user.id,
      action: "email_connection.imap_configured",
      resource_type: "channel",
      resource_id: channel.id,
      metadata: { email, imap_host: body.imapHost, smtp_host: body.smtpHost },
    });
    return json({ ok: true, status: "pending" });
  }

  if (body.action === "verify_imap") {
    const bridgeUrl = Deno.env.get("EMAIL_BRIDGE_URL")?.replace(/\/$/, "");
    const bridgeSecret = Deno.env.get("EMAIL_BRIDGE_SECRET");
    if (!bridgeUrl || !bridgeSecret) return json({ error: "Email Bridge non configurato" }, 503);
    const { data: connection } = await admin
      .from("email_connections")
      .select("id,provider")
      .eq("channel_id", channel.id)
      .eq("organization_id", body.organizationId)
      .maybeSingle();
    if (!connection || connection.provider !== "imap")
      return json({ error: "Connessione IMAP non trovata" }, 404);
    let payload: { ok?: boolean; error?: string };
    let bridgeStatus = 0;
    try {
      const bridgeResponse = await fetch(`${bridgeUrl}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-email-bridge-secret": bridgeSecret,
        },
        body: JSON.stringify({ connectionId: connection.id }),
        signal: AbortSignal.timeout(20_000),
      });
      bridgeStatus = bridgeResponse.status;
      payload = (await bridgeResponse.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
    } catch {
      const message =
        "Servizio IMAP/SMTP non raggiungibile: avvia il servizio Email Bridge e controlla EMAIL_BRIDGE_URL";
      await admin
        .from("email_connections")
        .update({ status: "error", last_error: message })
        .eq("id", connection.id);
      return json({ error: message }, 503);
    }
    if (bridgeStatus < 200 || bridgeStatus >= 300 || !payload.ok) {
      const message = payload.error ?? "Verifica IMAP/SMTP non riuscita";
      await admin
        .from("email_connections")
        .update({ status: "error", last_error: message })
        .eq("id", connection.id);
      return json({ error: message }, 502);
    }
    return json({ ok: true });

  }

  return json({ error: "Azione non supportata" }, 400);
});
