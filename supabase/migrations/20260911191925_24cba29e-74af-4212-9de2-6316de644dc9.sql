CREATE TABLE IF NOT EXISTS public.email_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL UNIQUE REFERENCES public.channels(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('microsoft','google','imap','resend')),
  auth_method text NOT NULL CHECK (auth_method IN ('oauth','password','api_key')),
  email_address text,
  display_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','connected','error','disconnected')),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  connected_by uuid,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.email_connections TO authenticated;
GRANT ALL ON public.email_connections TO service_role;
ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view email connections" ON public.email_connections
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP TRIGGER IF EXISTS update_email_connections_updated_at ON public.email_connections;
CREATE TRIGGER update_email_connections_updated_at BEFORE UPDATE ON public.email_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.email_connection_secrets (
  connection_id uuid PRIMARY KEY REFERENCES public.email_connections(id) ON DELETE CASCADE,
  encrypted_payload text NOT NULL,
  initialization_vector text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_connection_secrets TO service_role;
ALTER TABLE public.email_connection_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.channel_messages(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.channel_conversations(id) ON DELETE CASCADE,
  filename text NOT NULL,
  content_type text,
  size_bytes integer,
  storage_path text NOT NULL,
  kind text NOT NULL DEFAULT 'attachment',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_attachments_message_id_idx ON public.email_attachments(message_id);
GRANT SELECT ON public.email_attachments TO authenticated;
GRANT ALL ON public.email_attachments TO service_role;
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view email attachments" ON public.email_attachments
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
