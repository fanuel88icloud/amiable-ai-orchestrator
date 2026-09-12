import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { encryptSecret, verifyOAuthState } from "../_shared/email-security.ts";

type Provider = "microsoft" | "google";
type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error_description?: string;
  error?: string;
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function finish(channelId: string, success: boolean, detail?: string) {
  const appUrl = Deno.env.get("APP_URL")?.replace(/\/$/, "");
  if (!appUrl) return response({ ok: success, channelId, error: detail }, success ? 200 : 400);
  const target = new URL(`${appUrl}/canali/${channelId}`);
  target.searchParams.set(success ? "email_connected" : "email_error", detail ?? "1");
  return Response.redirect(target, 302);
}

Deno.serve(async (request) => {
  if (request.method !== "GET") return response({ error: "Metodo non consentito" }, 405);
  const url = new URL(request.url);
  const stateValue = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!stateValue || !code) return response({ error: "Codice OAuth mancante" }, 400);

  let state: Record<string, unknown>;
  try {
    state = await verifyOAuthState(stateValue);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Stato non valido" }, 400);
  }
  const provider = state.provider as Provider;
  const organizationId = String(state.organizationId ?? "");
  const channelId = String(state.channelId ?? "");
  const userId = String(state.userId ?? "");
  if (!organizationId || !channelId || !userId || !["microsoft", "google"].includes(provider))
    return response({ error: "Stato OAuth incompleto" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return finish(channelId, false, "Backend non configurato");
  const admin = createClient(supabaseUrl, serviceKey);
  const callbackUrl = `${supabaseUrl}/functions/v1/email-oauth-callback`;

  try {
    const clientId = Deno.env.get(
      provider === "microsoft" ? "MICROSOFT_CLIENT_ID" : "GOOGLE_CLIENT_ID",
    );
    const clientSecret = Deno.env.get(
      provider === "microsoft" ? "MICROSOFT_CLIENT_SECRET" : "GOOGLE_CLIENT_SECRET",
    );
    if (!clientId || !clientSecret) throw new Error(`Credenziali ${provider} non configurate`);
    const tokenUrl =
      provider === "microsoft"
        ? "https://login.microsoftonline.com/common/oauth2/v2.0/token"
        : "https://oauth2.googleapis.com/token";
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });
    const tokens = (await tokenResponse.json()) as TokenPayload;
    if (!tokenResponse.ok || !tokens.access_token || !tokens.refresh_token)
      throw new Error(tokens.error_description ?? tokens.error ?? "Token OAuth non ricevuto");

    let emailAddress = "";
    let displayName = "";
    let accountId = "";
    if (provider === "microsoft") {
      const profileResponse = await fetch(
        "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      const profile = (await profileResponse.json()) as {
        id?: string;
        displayName?: string;
        mail?: string;
        userPrincipalName?: string;
      };
      if (!profileResponse.ok) throw new Error("Profilo Microsoft non disponibile");
      emailAddress = profile.mail ?? profile.userPrincipalName ?? "";
      displayName = profile.displayName ?? "";
      accountId = profile.id ?? "";
    } else {
      const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = (await profileResponse.json()) as {
        sub?: string;
        email?: string;
        name?: string;
      };
      if (!profileResponse.ok) throw new Error("Profilo Google non disponibile");
      emailAddress = profile.email ?? "";
      displayName = profile.name ?? "";
      accountId = profile.sub ?? "";
    }
    if (!emailAddress) throw new Error("Indirizzo email non restituito dal provider");

    const expiresAt = new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString();
    const { data: connection, error: connectionError } = await admin
      .from("email_connections")
      .upsert(
        {
          organization_id: organizationId,
          channel_id: channelId,
          provider,
          auth_method: "oauth",
          email_address: emailAddress.toLowerCase(),
          display_name: displayName || null,
          status: "connected",
          configuration: {
            account_id: accountId,
            scopes: tokens.scope ?? null,
            runtime_ready: false,
          },
          token_expires_at: expiresAt,
          connected_by: userId,
          connected_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "channel_id" },
      )
      .select("id")
      .single();
    if (connectionError || !connection) throw new Error("Connessione email non registrata");
    const encrypted = await encryptSecret({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type ?? "Bearer",
      scope: tokens.scope ?? null,
    });
    const { error: secretError } = await admin.from("email_connection_secrets").upsert({
      connection_id: connection.id,
      encrypted_payload: encrypted.encryptedPayload,
      initialization_vector: encrypted.initializationVector,
      updated_at: new Date().toISOString(),
    });
    if (secretError) {
      await admin.from("email_connections").update({ status: "error" }).eq("id", connection.id);
      throw new Error("Credenziali email non protette");
    }
    const { data: channel } = await admin
      .from("channels")
      .select("configuration")
      .eq("id", channelId)
      .eq("organization_id", organizationId)
      .single();
    await admin
      .from("channels")
      .update({
        provider,
        credentials_ref: `email_connection:${connection.id}`,
        configuration: {
          ...((channel?.configuration ?? {}) as Record<string, unknown>),
          email_from_address: emailAddress.toLowerCase(),
          email_inbound_address: emailAddress.toLowerCase(),
          email_from_name: displayName,
        },
      })
      .eq("id", channelId)
      .eq("organization_id", organizationId);
    await admin.from("audit_logs").insert({
      organization_id: organizationId,
      user_id: userId,
      action: "email_connection.connected",
      resource_type: "channel",
      resource_id: channelId,
      metadata: { provider, email_address: emailAddress.toLowerCase() },
    });
    return finish(channelId, true);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Connessione non riuscita";
    await admin
      .from("email_connections")
      .update({ status: "error", last_error: detail })
      .eq("channel_id", channelId)
      .eq("organization_id", organizationId);
    return finish(channelId, false, detail);
  }
});
