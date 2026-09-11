const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++)
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function encryptionKey() {
  const secret = Deno.env.get("EMAIL_CREDENTIALS_ENCRYPTION_KEY");
  if (!secret) throw new Error("EMAIL_CREDENTIALS_ENCRYPTION_KEY non configurata");
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(secret);
  } catch {
    throw new Error("EMAIL_CREDENTIALS_ENCRYPTION_KEY deve essere Base64");
  }
  if (bytes.byteLength !== 32)
    throw new Error("EMAIL_CREDENTIALS_ENCRYPTION_KEY deve contenere 32 byte");
  return crypto.subtle.importKey(
    "raw",
    bytes.slice().buffer as ArrayBuffer,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(payload: Record<string, unknown>) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(JSON.stringify(payload)),
  );
  return {
    encryptedPayload: bytesToBase64(new Uint8Array(encrypted)),
    initializationVector: bytesToBase64(iv),
  };
}

export async function decryptSecret(encryptedPayload: string, initializationVector: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(initializationVector) },
    await encryptionKey(),
    base64ToBytes(encryptedPayload),
  );
  return JSON.parse(decoder.decode(decrypted)) as Record<string, unknown>;
}

async function sign(value: string) {
  const secret = Deno.env.get("EMAIL_OAUTH_STATE_SECRET");
  if (!secret) throw new Error("EMAIL_OAUTH_STATE_SECRET non configurato");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToBase64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function createOAuthState(payload: Record<string, unknown>) {
  const encoded = bytesToBase64(encoder.encode(JSON.stringify(payload)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${encoded}.${await sign(encoded)}`;
}

export async function verifyOAuthState(state: string) {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature || !constantTimeEqual(signature, await sign(encoded)))
    throw new Error("Stato OAuth non valido");
  const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const payload = JSON.parse(decoder.decode(base64ToBytes(padded))) as Record<string, unknown>;
  if (Number(payload.expiresAt ?? 0) < Date.now()) throw new Error("Stato OAuth scaduto");
  return payload;
}
