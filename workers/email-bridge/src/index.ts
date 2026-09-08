import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { config } from "./config.js";
import { validSecret } from "./crypto.js";
import { sendForConnection, syncAll, verifyConnection } from "./email.js";

function respond(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function body(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.from(chunk);
    size += value.byteLength;
    if (size > 128 * 1024) throw new Error("Request body too large");
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health")
    return respond(response, 200, { ok: true });
  if (request.method !== "POST") return respond(response, 405, { error: "Method not allowed" });
  if (!validSecret(request.headers["x-email-bridge-secret"] as string | undefined))
    return respond(response, 401, { error: "Unauthorized" });
  try {
    const payload = await body(request);
    const connectionId = String(payload.connectionId ?? "");
    if (!connectionId) return respond(response, 400, { error: "connectionId is required" });
    if (request.url === "/verify") {
      await verifyConnection(connectionId);
      return respond(response, 200, { ok: true });
    }
    if (request.url === "/send") {
      const to = String(payload.to ?? "").trim();
      const subject = String(payload.subject ?? "").trim();
      const text = String(payload.text ?? "").trim();
      if (!/^\S+@\S+\.\S+$/.test(to) || !subject || !text || text.length > 100_000)
        return respond(response, 400, { error: "Invalid email payload" });
      const messageId = await sendForConnection(connectionId, {
        to,
        subject,
        text,
        rfcMessageId: payload.rfcMessageId ? String(payload.rfcMessageId) : null,
      });
      return respond(response, 200, { ok: true, messageId });
    }
    return respond(response, 404, { error: "Not found" });
  } catch (error) {
    return respond(response, 502, {
      error: error instanceof Error ? error.message : "Unexpected bridge error",
    });
  }
});

let running = false;
async function scheduledSync() {
  if (running) return;
  running = true;
  try {
    const results = await syncAll();
    const failures = results.filter((result) => result.error);
    console.log(JSON.stringify({ event: "email_sync", checked: results.length, failures }));
  } catch (error) {
    console.error(error);
  } finally {
    running = false;
  }
}

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Email Bridge listening on port ${config.port}`);
  void scheduledSync();
  setInterval(() => void scheduledSync(), config.syncIntervalMs).unref();
});
