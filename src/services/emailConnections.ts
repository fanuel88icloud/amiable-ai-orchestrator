import { supabase } from "@/integrations/supabase/client";

export type EmailProvider = "microsoft" | "google" | "imap" | "resend";
export type EmailConnection = {
  id: string;
  provider: EmailProvider;
  auth_method: "oauth" | "password" | "api_key";
  email_address: string | null;
  display_name: string | null;
  status: "pending" | "connected" | "error" | "disconnected";
  configuration: Record<string, unknown>;
  token_expires_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  connected_at: string | null;
};

async function accessToken() {
  let { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("Impossibile verificare la sessione. Accedi nuovamente.");
  if (!data.session) {
    const refreshed = await supabase.auth.refreshSession();
    data = refreshed.data;
    error = refreshed.error;
  }
  if (error || !data.session?.access_token)
    throw new Error("Sessione scaduta. Esci e accedi nuovamente.");
  return data.session.access_token;
}

async function invokeFunction(name: string, body: Record<string, unknown>) {
  const token = await accessToken();
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const response = context.clone();
      const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
      if (payload?.error) throw new Error(String(payload.error));
      const detail = await context
        .clone()
        .text()
        .catch(() => "");
      if (detail.trim()) throw new Error(detail.trim().slice(0, 300));
    }
    throw new Error(error.message || "Funzione email non raggiungibile");
  }
  if (data?.error) throw new Error(String(data.error));
  return data;
}

async function invoke(body: Record<string, unknown>) {
  return invokeFunction("email-connection", body);
}

export async function fetchEmailConnection(organizationId: string, channelId: string) {
  const data = await invoke({ action: "status", organizationId, channelId });
  return (data?.connection ?? null) as EmailConnection | null;
}

export async function startEmailOAuth(
  organizationId: string,
  channelId: string,
  provider: "microsoft" | "google",
) {
  const data = await invoke({ action: "oauth_start", organizationId, channelId, provider });
  if (!data?.authorizationUrl) throw new Error("URL di autorizzazione non disponibile");
  return String(data.authorizationUrl);
}

export async function configureImapConnection(input: {
  organizationId: string;
  channelId: string;
  emailAddress: string;
  displayName?: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: "tls" | "starttls";
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "tls" | "starttls";
}) {
  return invoke({ action: "configure_imap", ...input });
}

export async function disconnectEmailConnection(organizationId: string, channelId: string) {
  return invoke({ action: "disconnect", organizationId, channelId });
}

export async function verifyImapConnection(organizationId: string, channelId: string) {
  return invoke({ action: "verify_imap", organizationId, channelId });
}

export async function syncEmailConnection(organizationId: string, channelId: string) {
  const data = await invokeFunction("email-sync", { organizationId, channelId });
  return data as { ok: true; imported: number; replied: number; syncedAt: string };
}
