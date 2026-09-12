import { createClient } from "npm:@supabase/supabase-js@2.111.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function constantTimeEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++)
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const expectedSecret = Deno.env.get("EMAIL_SYNC_SECRET") ?? "";
  const suppliedSecret = request.headers.get("x-email-sync-secret") ?? "";
  if (!supabaseUrl || !serviceKey || !constantTimeEqual(suppliedSecret, expectedSecret))
    return json({ error: "Richiesta pianificata non autorizzata" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: connections, error } = await admin
    .from("email_connections")
    .select("id,organization_id,channel_id,provider,last_sync_at")
    .eq("status", "connected")
    .in("provider", ["microsoft", "google"])
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(25);
  if (error) return json({ error: "Connessioni email non disponibili" }, 500);

  const channelIds = (connections ?? []).map((item) => item.channel_id);
  const { data: activeChannels } = channelIds.length
    ? await admin.from("channels").select("id").in("id", channelIds).eq("status", "active")
    : { data: [] };
  const activeIds = new Set((activeChannels ?? []).map((channel) => channel.id));
  const queue = (connections ?? []).filter((connection) => activeIds.has(connection.channel_id));
  const results: Array<{
    connectionId: string;
    ok: boolean;
    imported?: number;
    replied?: number;
    error?: string;
  }> = [];

  for (let offset = 0; offset < queue.length; offset += 5) {
    const batch = queue.slice(offset, offset + 5);
    const batchResults = await Promise.all(
      batch.map(async (connection) => {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/email-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-email-sync-secret": expectedSecret,
            },
            body: JSON.stringify({
              organizationId: connection.organization_id,
              channelId: connection.channel_id,
            }),
          });
          const payload = (await response.json()) as {
            imported?: number;
            replied?: number;
            error?: string;
          };
          return {
            connectionId: connection.id,
            ok: response.ok,
            imported: payload.imported,
            replied: payload.replied,
            error: response.ok ? undefined : (payload.error ?? "Sincronizzazione non riuscita"),
          };
        } catch (error) {
          return {
            connectionId: connection.id,
            ok: false,
            error: error instanceof Error ? error.message : "Errore inatteso",
          };
        }
      }),
    );
    results.push(...batchResults);
  }

  return json({
    ok: results.every((result) => result.ok),
    checked: queue.length,
    imported: results.reduce((total, result) => total + (result.imported ?? 0), 0),
    replied: results.reduce((total, result) => total + (result.replied ?? 0), 0),
    failures: results.filter((result) => !result.ok),
  });
});
