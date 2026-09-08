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

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("email-connection", { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data;
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
