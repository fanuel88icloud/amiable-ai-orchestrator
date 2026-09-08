function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  syncIntervalMs: Math.max(Number(process.env.SYNC_INTERVAL_MS ?? 300_000), 60_000),
  supabaseUrl: required("SUPABASE_URL").replace(/\/$/, ""),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  encryptionKey: required("EMAIL_CREDENTIALS_ENCRYPTION_KEY"),
  bridgeSecret: required("EMAIL_BRIDGE_SECRET"),
  openAiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
};
