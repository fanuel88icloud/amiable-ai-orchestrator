CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('amiable-email-sync');
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'amiable-email-sync',
  '*/5 * * * *',
  $job$
    SELECT net.http_post(
      url := secrets.project_url || '/functions/v1/email-sync-scheduled',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-email-sync-secret', secrets.sync_secret
      ),
      body := '{"scheduled":true}'::jsonb,
      timeout_milliseconds := 120000
    )
    FROM (
      SELECT
        max(decrypted_secret) FILTER (WHERE name = 'project_url') AS project_url,
        max(decrypted_secret) FILTER (WHERE name = 'email_sync_secret') AS sync_secret
      FROM vault.decrypted_secrets
    ) AS secrets
    WHERE secrets.project_url IS NOT NULL
      AND secrets.sync_secret IS NOT NULL;
  $job$
);
