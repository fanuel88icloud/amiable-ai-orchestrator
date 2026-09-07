CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS public_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS api_key_hash text,
  ADD COLUMN IF NOT EXISTS api_key_rotated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS channels_public_id_idx ON public.channels(public_id);
CREATE INDEX IF NOT EXISTS channels_agent_idx ON public.channels(agent_id);

CREATE TABLE IF NOT EXISTS public.channel_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  external_session_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','handoff')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, external_session_id)
);
CREATE INDEX IF NOT EXISTS channel_conversations_org_idx ON public.channel_conversations(organization_id, updated_at DESC);
GRANT SELECT ON public.channel_conversations TO authenticated;
GRANT ALL ON public.channel_conversations TO service_role;
ALTER TABLE public.channel_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channel conversations readable by members" ON public.channel_conversations
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE TABLE IF NOT EXISTS public.channel_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.channel_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','tool')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channel_messages_conversation_idx ON public.channel_messages(conversation_id, created_at);
GRANT SELECT ON public.channel_messages TO authenticated;
GRANT ALL ON public.channel_messages TO service_role;
ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channel messages readable by members" ON public.channel_messages
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE TABLE IF NOT EXISTS public.channel_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.channel_conversations(id) ON DELETE SET NULL,
  requester_hash text,
  status text NOT NULL,
  duration_ms integer,
  input_tokens integer,
  output_tokens integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channel_runs_rate_idx ON public.channel_runs(channel_id, requester_hash, created_at DESC);
GRANT SELECT ON public.channel_runs TO authenticated;
GRANT ALL ON public.channel_runs TO service_role;
ALTER TABLE public.channel_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channel runs readable by members" ON public.channel_runs
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.rotate_channel_api_key(_channel_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  target public.channels;
  plain_key text;
BEGIN
  SELECT * INTO target FROM public.channels WHERE id = _channel_id;
  IF target.id IS NULL OR NOT public.can_write_org(target.organization_id) THEN
    RAISE EXCEPTION 'Canale non trovato o permessi insufficienti';
  END IF;
  plain_key := 'ch_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  UPDATE public.channels
    SET api_key_hash = encode(digest(plain_key, 'sha256'), 'hex'), api_key_rotated_at = now()
    WHERE id = _channel_id;
  INSERT INTO public.audit_logs(organization_id, user_id, action, resource_type, resource_id)
    VALUES(target.organization_id, auth.uid(), 'channel.api_key_rotated', 'channel', target.id);
  RETURN plain_key;
END;
$$;
REVOKE ALL ON FUNCTION public.rotate_channel_api_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_channel_api_key(uuid) TO authenticated;

CREATE TRIGGER update_channel_conversations_updated_at
  BEFORE UPDATE ON public.channel_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
