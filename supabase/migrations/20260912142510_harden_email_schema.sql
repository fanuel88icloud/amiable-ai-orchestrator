-- Reconcile the two historical email-schema variants so both an existing
-- Lovable database and a clean installation expose the columns used by the
-- Edge Functions and the Railway email bridge.
ALTER TABLE public.email_connections
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz;

ALTER TABLE public.email_connection_secrets
  ADD COLUMN IF NOT EXISTS key_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.email_attachments
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.channel_conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sha256 text;

CREATE INDEX IF NOT EXISTS email_attachments_channel_idx
  ON public.email_attachments(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_attachments_conversation_idx
  ON public.email_attachments(conversation_id, created_at DESC);

ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_connection_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_connection_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_connection_secrets TO service_role;
