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
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_connections_org_idx
  ON public.email_connections(organization_id, status, provider);

CREATE TABLE IF NOT EXISTS public.email_connection_secrets (
  connection_id uuid PRIMARY KEY REFERENCES public.email_connections(id) ON DELETE CASCADE,
  encrypted_payload text NOT NULL,
  initialization_vector text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_connection_secrets ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.email_connections TO authenticated;
GRANT ALL ON public.email_connections TO service_role;
GRANT ALL ON public.email_connection_secrets TO service_role;

CREATE POLICY "email connections readable by members" ON public.email_connections
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

COMMENT ON TABLE public.email_connection_secrets IS
  'Service-role-only encrypted OAuth tokens and mailbox credentials.';

CREATE TRIGGER update_email_connections_updated_at
  BEFORE UPDATE ON public.email_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
