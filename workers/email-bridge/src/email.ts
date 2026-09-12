import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";

import { config } from "./config.js";
import { decryptSecret, sha256 } from "./crypto.js";

const gatewayFetch: typeof fetch = async (input, init) => {
  const source = new URL(input instanceof Request ? input.url : String(input));
  const sourceHeaders = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers)
    new Headers(init.headers).forEach((value, key) => sourceHeaders.set(key, value));
  const headers = new Headers({
    "x-email-bridge-secret": config.bridgeSecret,
    "x-upstream-path": `${source.pathname}${source.search}`,
  });
  for (const name of [
    "accept",
    "accept-profile",
    "content-profile",
    "content-type",
    "prefer",
    "range",
    "range-unit",
  ])
    if (sourceHeaders.has(name)) headers.set(name, sourceHeaders.get(name)!);
  const response = await fetch(config.gatewayUrl, {
    method: init?.method ?? (input instanceof Request ? input.method : "GET"),
    headers,
    body:
      init?.body ??
      (input instanceof Request && input.method !== "GET" ? await input.arrayBuffer() : undefined),
    redirect: "error",
  });
  return response;
};

const supabase = createClient(config.supabaseUrl, "email-bridge-gateway", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: gatewayFetch },
});

type Connection = {
  id: string;
  organization_id: string;
  channel_id: string;
  email_address: string;
  display_name: string | null;
  status: string;
  configuration: Record<string, unknown>;
  connected_at: string | null;
  last_sync_at: string | null;
};

type Channel = {
  id: string;
  organization_id: string;
  agent_id: string | null;
  status: string;
  configuration: Record<string, unknown>;
};

type Credentials = { username: string; password: string };

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (isIP(normalized) === 4)
    return (
      /^10\./.test(normalized) ||
      /^127\./.test(normalized) ||
      /^169\.254\./.test(normalized) ||
      /^192\.168\./.test(normalized) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) ||
      normalized === "0.0.0.0"
    );
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

async function assertPublicMailHost(value: unknown) {
  const hostname = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local"))
    throw new Error("Private mail hosts are not allowed");
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address)))
    throw new Error("Private mail hosts are not allowed");
}

async function context(connectionId: string) {
  const { data: connection, error } = await supabase
    .from("email_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("provider", "imap")
    .single();
  if (error || !connection) throw new Error("IMAP connection not found");
  const { data: channel, error: channelError } = await supabase
    .from("channels")
    .select("id,organization_id,agent_id,status,configuration")
    .eq("id", connection.channel_id)
    .eq("organization_id", connection.organization_id)
    .single();
  if (channelError || !channel) throw new Error("Email channel not found");
  const { data: secret, error: secretError } = await supabase
    .from("email_connection_secrets")
    .select("encrypted_payload,initialization_vector")
    .eq("connection_id", connection.id)
    .single();
  if (secretError || !secret) throw new Error("Encrypted mailbox credentials not found");
  return {
    connection: connection as Connection,
    channel: channel as Channel,
    credentials: decryptSecret(secret.encrypted_payload, secret.initialization_vector),
  };
}

function imapClient(connection: Connection, credentials: Credentials) {
  const settings = connection.configuration;
  const startTls = settings.imap_security === "starttls";
  return new ImapFlow({
    host: String(settings.imap_host),
    port: Number(settings.imap_port),
    secure: !startTls,
    doSTARTTLS: startTls,
    auth: { user: credentials.username, pass: credentials.password },
    logger: false,
    tls: { rejectUnauthorized: true },
  });
}

function smtpTransport(connection: Connection, credentials: Credentials) {
  const settings = connection.configuration;
  const startTls = settings.smtp_security === "starttls";
  return nodemailer.createTransport({
    host: String(settings.smtp_host),
    port: Number(settings.smtp_port),
    secure: !startTls,
    requireTLS: startTls,
    auth: { user: credentials.username, pass: credentials.password },
    tls: { rejectUnauthorized: true },
  });
}

export async function verifyConnection(connectionId: string) {
  const { connection, credentials } = await context(connectionId);
  await Promise.all([
    assertPublicMailHost(connection.configuration.imap_host),
    assertPublicMailHost(connection.configuration.smtp_host),
  ]);
  const client = imapClient(connection, credentials);
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
  } finally {
    if (client.usable) await client.logout().catch(() => undefined);
  }
  await smtpTransport(connection, credentials).verify();
  const settings = connection.configuration;
  const { error } = await supabase
    .from("email_connections")
    .update({
      status: "connected",
      connected_at: connection.connected_at ?? new Date().toISOString(),
      last_error: null,
      configuration: { ...settings, runtime_ready: true },
    })
    .eq("id", connection.id);
  if (error) throw new Error("Verified connection could not be saved");
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

function pecReceiptType(mail: ParsedMail) {
  const subject = mail.subject?.toUpperCase() ?? "";
  const headers = [...mail.headers.keys()].map(String);
  if (subject.includes("ACCETTAZIONE")) return "acceptance";
  if (subject.includes("AVVENUTA CONSEGNA") || subject.includes("CONSEGNA")) return "delivery";
  if (subject.includes("ANOMALIA MESSAGGIO")) return "anomaly";
  if (headers.some((header) => ["x-ricevuta", "x-trasporto"].includes(header.toLowerCase())))
    return "certified";
  return null;
}

function address(mail: ParsedMail) {
  return mail.from?.value[0]?.address?.toLowerCase() ?? "";
}

function threadKey(mail: ParsedMail, fallback: string) {
  const reference = Array.isArray(mail.references) ? mail.references.at(-1) : mail.references;
  return String(reference ?? mail.inReplyTo ?? mail.messageId ?? fallback).slice(0, 500);
}

async function storeFile(input: {
  connection: Connection;
  messageId: string;
  kind: "attachment" | "original_eml";
  filename: string;
  contentType: string;
  content: Buffer;
}) {
  if (input.content.byteLength > 25 * 1024 * 1024) return null;
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160);
  const path = `${input.connection.organization_id}/${input.connection.channel_id}/${input.messageId}/${randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("email-attachments")
    .upload(path, input.content, { contentType: input.contentType, upsert: false });
  if (uploadError) throw new Error(`File upload failed: ${safeName}`);
  const { error: recordError } = await supabase.from("email_attachments").insert({
    organization_id: input.connection.organization_id,
    channel_id: input.connection.channel_id,
    message_id: input.messageId,
    kind: input.kind,
    filename: input.filename,
    content_type: input.contentType,
    size_bytes: input.content.byteLength,
    storage_path: path,
    sha256: sha256(input.content),
  });
  if (recordError) {
    await supabase.storage.from("email-attachments").remove([path]);
    throw new Error(`File metadata failed: ${safeName}`);
  }
  return path;
}

async function sendMail(
  connection: Connection,
  credentials: Credentials,
  input: {
    to: string;
    subject: string;
    text: string;
    rfcMessageId?: string | null;
  },
) {
  const info = await smtpTransport(connection, credentials).sendMail({
    from: connection.display_name
      ? { name: connection.display_name, address: connection.email_address }
      : connection.email_address,
    to: input.to,
    subject: /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`,
    text: input.text,
    inReplyTo: input.rfcMessageId ?? undefined,
    references: input.rfcMessageId ? [input.rfcMessageId] : undefined,
  });
  return info.messageId;
}

export async function sendForConnection(
  connectionId: string,
  input: { to: string; subject: string; text: string; rfcMessageId?: string | null },
) {
  const { connection, credentials } = await context(connectionId);
  if (connection.status !== "connected") throw new Error("Mailbox is not connected");
  return sendMail(connection, credentials, input);
}

async function automaticReply(
  connection: Connection,
  channel: Channel,
  credentials: Credentials,
  conversationId: string,
  mail: ParsedMail,
) {
  if (!config.openAiKey || !channel.agent_id) throw new Error("AI email agent is not configured");
  const { data: version } = await supabase
    .from("agent_versions")
    .select("*")
    .eq("agent_id", channel.agent_id)
    .eq("organization_id", channel.organization_id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) throw new Error("Published agent version not found");
  const { data: history } = await supabase
    .from("channel_messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant", "operator"])
    .order("created_at", { ascending: true })
    .limit(30);
  const handoffToken = "[PASSA_A_OPERATORE]";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: String(version.model_name).replace(/^openai\//, ""),
      instructions: `${version.system_instructions ?? ""}\nRispondi come email in testo semplice. Se serve un operatore umano termina con ${handoffToken}.`,
      input: (history ?? []).map((item) => ({
        role: item.role === "operator" ? "assistant" : item.role,
        content: item.content,
      })),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error("AI response generation failed");
  let answer = extractText(payload);
  if (!answer) throw new Error("AI returned an empty response");
  const handoff = answer.includes(handoffToken);
  answer = answer.replaceAll(handoffToken, "").trim();
  if (handoff) {
    await supabase
      .from("channel_conversations")
      .update({ status: "handoff", handoff_reason: "Richiesto dall’agente AI via email" })
      .eq("id", conversationId);
    return;
  }
  const signature = String(channel.configuration.email_signature ?? "").trim();
  const text = signature ? `${answer}\n\n${signature}` : answer;
  const providerId = await sendMail(connection, credentials, {
    to: address(mail),
    subject: mail.subject ?? "Risposta",
    text,
    rfcMessageId: mail.messageId,
  });
  await supabase.from("channel_messages").insert({
    organization_id: channel.organization_id,
    channel_id: channel.id,
    conversation_id: conversationId,
    role: "assistant",
    content: text,
    provider_message_id: providerId,
    in_reply_to: mail.messageId ?? null,
    metadata: { provider: "imap", response_id: payload.id, delivered: true },
  });
}

async function ingest(
  connection: Connection,
  channel: Channel,
  credentials: Credentials,
  providerId: string,
  raw: Buffer,
  receivedAt: Date,
) {
  const { data: duplicate } = await supabase
    .from("channel_messages")
    .select("id")
    .eq("channel_id", channel.id)
    .eq("provider_message_id", providerId)
    .maybeSingle();
  if (duplicate) return false;
  const mail = await simpleParser(raw, { skipHtmlToText: false });
  const fromAddress = address(mail);
  const content = (mail.text?.trim() || mail.textAsHtml?.replace(/<[^>]+>/g, " ") || "").slice(
    0,
    100_000,
  );
  if (!fromAddress || !content) return false;
  const key = threadKey(mail, providerId);
  const { data: conversation, error: conversationError } = await supabase
    .from("channel_conversations")
    .upsert(
      {
        organization_id: channel.organization_id,
        channel_id: channel.id,
        external_session_id: `email:imap:${sha256(key)}`,
        contact_name: mail.from?.value[0]?.name || null,
        contact_address: fromAddress,
        subject: mail.subject ?? "Senza oggetto",
        metadata: { provider: "imap", thread_reference: key },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,external_session_id" },
    )
    .select("id,status")
    .single();
  if (conversationError || !conversation) throw new Error("Conversation could not be created");
  const receiptType = pecReceiptType(mail);
  const { data: message, error: messageError } = await supabase
    .from("channel_messages")
    .insert({
      organization_id: channel.organization_id,
      channel_id: channel.id,
      conversation_id: conversation.id,
      role: "user",
      content,
      provider_message_id: providerId,
      in_reply_to: mail.inReplyTo ?? null,
      created_at: receivedAt.toISOString(),
      metadata: {
        provider: "imap",
        rfc_message_id: mail.messageId ?? null,
        pec_receipt_type: receiptType,
        attachments: mail.attachments.map((item) => ({
          filename: item.filename,
          content_type: item.contentType,
          size: item.size,
        })),
      },
    })
    .select("id")
    .single();
  if (messageError?.code === "23505") return false;
  if (messageError || !message) throw new Error("Email could not be stored");
  const uploadedPaths: string[] = [];
  try {
    if (receiptType) {
      const path = await storeFile({
        connection,
        messageId: message.id,
        kind: "original_eml",
        filename: `${mail.messageId?.replace(/[^a-zA-Z0-9.-]/g, "_") || message.id}.eml`,
        contentType: "message/rfc822",
        content: raw,
      });
      if (path) uploadedPaths.push(path);
    }
    for (const attachment of mail.attachments) {
      const path = await storeFile({
        connection,
        messageId: message.id,
        kind: "attachment",
        filename: attachment.filename ?? "allegato.bin",
        contentType: attachment.contentType,
        content: attachment.content,
      });
      if (path) uploadedPaths.push(path);
    }
  } catch (error) {
    if (uploadedPaths.length)
      await supabase.storage
        .from("email-attachments")
        .remove(uploadedPaths)
        .catch(() => undefined);
    await supabase.from("channel_messages").delete().eq("id", message.id);
    throw error;
  }
  if (receiptType) return true;
  if (conversation.status === "closed") {
    await supabase
      .from("channel_conversations")
      .update({ status: "handoff", handoff_reason: "Nuova email su conversazione chiusa" })
      .eq("id", conversation.id);
  } else if (channel.configuration.email_reply_mode === "automatic") {
    try {
      await automaticReply(connection, channel, credentials, conversation.id, mail);
    } catch (error) {
      await supabase
        .from("channel_conversations")
        .update({
          status: "handoff",
          handoff_reason: `Errore risposta email: ${error instanceof Error ? error.message : "errore inatteso"}`,
        })
        .eq("id", conversation.id);
    }
  } else if (conversation.status === "open") {
    await supabase
      .from("channel_conversations")
      .update({ status: "handoff", handoff_reason: "Canale email in gestione operatore" })
      .eq("id", conversation.id);
  }
  return true;
}

export async function syncConnection(connectionId: string) {
  const { connection, channel, credentials } = await context(connectionId);
  if (connection.status !== "connected" || channel.status !== "active") return 0;
  const client = imapClient(connection, credentials);
  let imported = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(
        connection.last_sync_at ?? connection.connected_at ?? Date.now() - 5 * 60_000,
      );
      const ids = await client.search({ since }, { uid: true });
      if (Array.isArray(ids) && ids.length) {
        for await (const item of client.fetch(
          ids,
          { uid: true, source: true, internalDate: true },
          { uid: true },
        )) {
          if (!item.source || !item.uid) continue;
          const uidValidity = client.mailbox ? String(client.mailbox.uidValidity) : "unknown";
          const providerId = `imap:${connection.id}:${uidValidity}:${item.uid}`;
          if (
            await ingest(
              connection,
              channel,
              credentials,
              providerId,
              Buffer.from(item.source),
              item.internalDate ? new Date(item.internalDate) : new Date(),
            )
          )
            imported++;
        }
      }
    } finally {
      lock.release();
    }
    await supabase
      .from("email_connections")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("id", connection.id);
    return imported;
  } catch (error) {
    await supabase
      .from("email_connections")
      .update({
        last_error: error instanceof Error ? error.message : "IMAP synchronization failed",
      })
      .eq("id", connection.id);
    throw error;
  } finally {
    if (client.usable) await client.logout().catch(() => undefined);
  }
}

export async function syncAll() {
  const { data } = await supabase
    .from("email_connections")
    .select("id")
    .eq("provider", "imap")
    .eq("status", "connected")
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(25);
  const results: Array<{ connectionId: string; imported: number; error?: string }> = [];
  for (const item of data ?? []) {
    try {
      results.push({ connectionId: item.id, imported: await syncConnection(item.id) });
    } catch (error) {
      results.push({
        connectionId: item.id,
        imported: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  return results;
}
