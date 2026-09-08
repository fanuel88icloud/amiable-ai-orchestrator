const corsHeaders = { "Content-Type": "application/json" };

const allowedTables = new Set([
  "agent_versions",
  "channel_conversations",
  "channel_messages",
  "channels",
  "email_attachments",
  "email_connection_secrets",
  "email_connections",
]);

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function permitted(path: string) {
  const parsed = new URL(path, "https://internal.invalid");
  if (parsed.pathname.startsWith("/rest/v1/")) {
    const table = parsed.pathname.slice("/rest/v1/".length).split("/")[0];
    const select = parsed.searchParams.get("select") ?? "";
    // Embedded PostgREST relations could escape the table allowlist.
    return allowedTables.has(table) && !select.includes("(") && !select.includes(":");
  }
  return (
    parsed.pathname === "/storage/v1/object/email-attachments" ||
    parsed.pathname.startsWith("/storage/v1/object/email-attachments/")
  );
}

Deno.serve(async (request) => {
  const expectedSecret = Deno.env.get("EMAIL_BRIDGE_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!expectedSecret || !serviceRoleKey || !supabaseUrl)
    return json({ error: "Gateway non configurato" }, 503);

  const suppliedSecret = request.headers.get("x-email-bridge-secret") ?? "";
  if (suppliedSecret.length !== expectedSecret.length)
    return json({ error: "Non autorizzato" }, 401);
  const left = new TextEncoder().encode(suppliedSecret);
  const right = new TextEncoder().encode(expectedSecret);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  if (difference !== 0) return json({ error: "Non autorizzato" }, 401);

  const path = request.headers.get("x-upstream-path") ?? "";
  if (!path.startsWith("/") || path.startsWith("//") || !permitted(path))
    return json({ error: "Percorso non consentito" }, 403);
  if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method))
    return json({ error: "Metodo non consentito" }, 405);

  const headers = new Headers({
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
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
    if (request.headers.has(name)) headers.set(name, request.headers.get(name)!);

  try {
    const upstream = await fetch(`${supabaseUrl}${path}`, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.arrayBuffer(),
      redirect: "error",
    });
    const responseHeaders = new Headers();
    for (const name of ["content-type", "content-range", "range-unit", "x-supabase-api-version"])
      if (upstream.headers.has(name)) responseHeaders.set(name, upstream.headers.get(name)!);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return json({ error: "Servizio dati non raggiungibile" }, 502);
  }
});
