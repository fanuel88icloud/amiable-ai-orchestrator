import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";

import { config } from "./config.js";

const key = Buffer.from(config.encryptionKey, "base64");
if (key.byteLength !== 32)
  throw new Error("EMAIL_CREDENTIALS_ENCRYPTION_KEY must contain 32 bytes in Base64");

export function decryptSecret(encryptedPayload: string, initializationVector: string) {
  const combined = Buffer.from(encryptedPayload, "base64");
  if (combined.byteLength < 17) throw new Error("Encrypted credentials are invalid");
  const authTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(0, combined.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(initializationVector, "base64"),
  );
  decipher.setAuthTag(authTag);
  return JSON.parse(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"),
  ) as {
    username: string;
    password: string;
  };
}

export function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

export function validSecret(value: string | undefined) {
  const supplied = Buffer.from(value ?? "");
  const expected = Buffer.from(config.bridgeSecret);
  return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected);
}
