import { decryptSecret, encryptSecret } from "./email-security.ts";

type AdminClient = ReturnType<typeof import("npm:@supabase/supabase-js@2").createClient>;

type EmailConnection = {
  id: string;
  provider: "microsoft" | "google" | "imap";
  token_expires_at: string | null;
  configuration: Record<string, unknown>;
};

type StoredTokens = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string | null;
};

type TokenResponse = StoredTokens & {
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export type ProviderMessage = {
  providerMessageId: string;
  providerThreadId: string | null;
  rfcMessageId: string | null;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  text: string;
  receivedAt: string;
};

function base64UrlToText(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function textToBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function mimeHeader(value: string) {
  if (/^[\x20-\x7e]*$/.test(value)) return value.replace(/[\r\n]/g, " ");
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(value)))}?=`;
}

async function loadTokens(admin: AdminClient, connection: EmailConnection) {
  const { data: secret, error } = await admin
    .from("email_connection_secrets")
    .select("encrypted_payload,initialization_vector")
    .eq("connection_id", connection.id)
    .single();
  if (error || !secret) throw new Error("Credenziali email non disponibili");
  return (await decryptSecret(
    secret.encrypted_payload,
    secret.initialization_vector,
  )) as StoredTokens;
}

async function refreshTokens(
  admin: AdminClient,
  connection: EmailConnection,
  current: StoredTokens,
) {
  if (!current.refresh_token)
    throw new Error("Token di rinnovo non disponibile: ricollega la casella");
  const microsoft = connection.provider === "microsoft";
  const clientId = Deno.env.get(microsoft ? "MICROSOFT_CLIENT_ID" : "GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get(microsoft ? "MICROSOFT_CLIENT_SECRET" : "GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Credenziali OAuth del provider non configurate");
  const params: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: current.refresh_token,
    grant_type: "refresh_token",
  };
  if (microsoft && current.scope) params.scope = current.scope;
  const response = await fetch(
    microsoft
      ? "https://login.microsoftonline.com/common/oauth2/v2.0/token"
      : "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    },
  );
  const payload = (await response.json()) as TokenResponse;
  if (!response.ok || !payload.access_token)
    throw new Error(payload.error_description ?? payload.error ?? "Rinnovo token non riuscito");
  const tokens: StoredTokens = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? current.refresh_token,
    token_type: payload.token_type ?? current.token_type ?? "Bearer",
    scope: payload.scope ?? current.scope ?? null,
  };
  const encrypted = await encryptSecret(tokens);
  const expiresAt = new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString();
  const { error: secretError } = await admin
    .from("email_connection_secrets")
    .update({
      encrypted_payload: encrypted.encryptedPayload,
      initialization_vector: encrypted.initializationVector,
      updated_at: new Date().toISOString(),
    })
    .eq("connection_id", connection.id);
  if (secretError) throw new Error("Token rinnovato ma non salvato");
  await admin
    .from("email_connections")
    .update({ token_expires_at: expiresAt })
    .eq("id", connection.id);
  return tokens;
}

export async function accessToken(admin: AdminClient, connection: EmailConnection) {
  const tokens = await loadTokens(admin, connection);
  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0;
  if (tokens.access_token && expiresAt > Date.now() + 120_000) return tokens.access_token;
  return (await refreshTokens(admin, connection, tokens)).access_token!;
}

function gmailText(part: Record<string, unknown>): string {
  const mimeType = String(part.mimeType ?? "");
  const body = (part.body ?? {}) as { data?: string };
  if (mimeType === "text/plain" && body.data) return base64UrlToText(body.data).trim();
  const parts = Array.isArray(part.parts) ? (part.parts as Record<string, unknown>[]) : [];
  for (const child of parts) {
    const value = gmailText(child);
    if (value) return value;
  }
  if (mimeType === "text/html" && body.data)
    return base64UrlToText(body.data)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return "";
}

function gmailHeader(payload: Record<string, unknown>, name: string) {
  const headers = Array.isArray(payload.headers)
    ? (payload.headers as Array<{ name?: string; value?: string }>)
    : [];
  return headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function address(value: string) {
  return (
    value
      .match(/<([^>]+)>/)?.[1]
      ?.trim()
      .toLowerCase() ?? value.trim().toLowerCase()
  );
}

function senderName(value: string) {
  const result = value
    .replace(/<[^>]+>/, "")
    .trim()
    .replace(/^"|"$/g, "");
  return result && result !== value ? result : null;
}

export async function listProviderMessages(
  admin: AdminClient,
  connection: EmailConnection,
  since: string,
) {
  const token = await accessToken(admin, connection);
  if (connection.provider === "microsoft") {
    const query = new URLSearchParams({
      $select: "id,conversationId,internetMessageId,receivedDateTime,subject,from,body",
      $filter: `receivedDateTime ge ${since}`,
      $orderby: "receivedDateTime asc",
      $top: "50",
    });
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${query}`,
      {
        headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' },
      },
    );
    const payload = (await response.json()) as {
      value?: Array<Record<string, unknown>>;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(payload.error?.message ?? "Lettura Outlook non riuscita");
    return (payload.value ?? []).map((item): ProviderMessage => {
      const from = (item.from ?? {}) as { emailAddress?: { address?: string; name?: string } };
      const body = (item.body ?? {}) as { content?: string };
      return {
        providerMessageId: String(item.id),
        providerThreadId: item.conversationId ? String(item.conversationId) : null,
        rfcMessageId: item.internetMessageId ? String(item.internetMessageId) : null,
        fromAddress: String(from.emailAddress?.address ?? "").toLowerCase(),
        fromName: from.emailAddress?.name ?? null,
        subject: String(item.subject ?? "Senza oggetto"),
        text: String(body.content ?? "")
          .trim()
          .slice(0, 100_000),
        receivedAt: String(item.receivedDateTime ?? new Date().toISOString()),
      };
    });
  }

  const after = Math.floor(new Date(since).getTime() / 1000);
  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: `in:inbox after:${after}`, maxResults: "50" })}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const list = (await listResponse.json()) as {
    messages?: Array<{ id: string; threadId?: string }>;
    error?: { message?: string };
  };
  if (!listResponse.ok) throw new Error(list.error?.message ?? "Lettura Gmail non riuscita");
  const messages: ProviderMessage[] = [];
  for (const reference of (list.messages ?? []).reverse()) {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(reference.id)}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const item = (await response.json()) as Record<string, unknown> & {
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(item.error?.message ?? "Messaggio Gmail non disponibile");
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const from = gmailHeader(payload, "From");
    messages.push({
      providerMessageId: String(item.id),
      providerThreadId: item.threadId ? String(item.threadId) : null,
      rfcMessageId: gmailHeader(payload, "Message-ID") || null,
      fromAddress: address(from),
      fromName: senderName(from),
      subject: gmailHeader(payload, "Subject") || "Senza oggetto",
      text: gmailText(payload).slice(0, 100_000),
      receivedAt: new Date(Number(item.internalDate ?? Date.now())).toISOString(),
    });
  }
  return messages;
}

export async function sendProviderEmail(
  admin: AdminClient,
  connection: EmailConnection,
  input: {
    to: string;
    subject: string;
    text: string;
    providerMessageId?: string | null;
    providerThreadId?: string | null;
    rfcMessageId?: string | null;
  },
) {
  if (connection.provider === "imap") {
    const bridgeUrl = Deno.env.get("EMAIL_BRIDGE_URL")?.replace(/\/$/, "");
    const bridgeSecret = Deno.env.get("EMAIL_BRIDGE_SECRET");
    if (!bridgeUrl || !bridgeSecret) throw new Error("Email Bridge non configurato");
    const response = await fetch(`${bridgeUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-email-bridge-secret": bridgeSecret,
      },
      body: JSON.stringify({ connectionId: connection.id, ...input }),
    });
    const payload = (await response.json()) as { messageId?: string; error?: string };
    if (!response.ok || !payload.messageId)
      throw new Error(payload.error ?? "Invio SMTP non riuscito");
    return payload.messageId;
  }
  const token = await accessToken(admin, connection);
  if (connection.provider === "microsoft") {
    const endpoint = input.providerMessageId
      ? `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(input.providerMessageId)}/reply`
      : "https://graph.microsoft.com/v1.0/me/sendMail";
    const body = input.providerMessageId
      ? { comment: input.text }
      : {
          message: {
            subject: /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`,
            body: { contentType: "Text", content: input.text },
            toRecipients: [{ emailAddress: { address: input.to } }],
          },
          saveToSentItems: true,
        };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      throw new Error(payload.error?.message ?? "Invio Outlook non riuscito");
    }
    return `microsoft:${crypto.randomUUID()}`;
  }

  const subject = /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`;
  const headers = [
    `To: ${input.to}`,
    `Subject: ${mimeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
  ];
  if (input.rfcMessageId) {
    headers.push(`In-Reply-To: ${input.rfcMessageId}`, `References: ${input.rfcMessageId}`);
  }
  const raw = textToBase64Url(`${headers.join("\r\n")}\r\n\r\n${input.text}`);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw, threadId: input.providerThreadId ?? undefined }),
  });
  const payload = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !payload.id)
    throw new Error(payload.error?.message ?? "Invio Gmail non riuscito");
  return payload.id;
}
