-- 1. Explicit deny of direct client writes on server-managed tables + tight grants
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.agent_test_messages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.agent_test_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.channel_conversations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.channel_messages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.channel_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.email_connections FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.email_attachments FROM anon, authenticated;
REVOKE SELECT ON public.agent_test_messages, public.agent_test_runs, public.channel_conversations,
  public.channel_messages, public.channel_runs, public.email_connections, public.email_attachments FROM anon;
REVOKE ALL ON public.email_connection_secrets FROM anon, authenticated;
GRANT ALL ON public.email_connection_secrets TO service_role;

-- Explicit deny-write policies (documented no client-side writes; all writes go through backend)
CREATE POLICY "No client writes to test messages" ON public.agent_test_messages
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client writes to test runs" ON public.agent_test_runs
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client writes to conversations" ON public.channel_conversations
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client writes to channel messages" ON public.channel_messages
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client writes to channel runs" ON public.channel_runs
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client writes to email connections" ON public.email_connections
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client writes to email attachments" ON public.email_attachments
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Email connection secrets are backend only" ON public.email_connection_secrets
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- 2. Remove reliance on SECURITY DEFINER for client-callable RPCs
CREATE POLICY "Managers create agent versions" ON public.agent_versions
  FOR INSERT TO authenticated
  WITH CHECK (private.can_write_org(organization_id) AND (created_by IS NULL OR created_by = auth.uid()));

CREATE OR REPLACE FUNCTION public.publish_agent(_agent_id uuid)
RETURNS public.agent_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  a public.agents;
  v public.agent_versions;
  next_version integer;
BEGIN
  SELECT * INTO a FROM public.agents WHERE id = _agent_id;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente non trovato';
  END IF;
  IF NOT private.can_write_org(a.organization_id) THEN
    RAISE EXCEPTION 'Permessi insufficienti per pubblicare questo agente';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
  FROM public.agent_versions WHERE agent_id = _agent_id;

  INSERT INTO public.agent_versions (
    organization_id, agent_id, version_number, name, description,
    model_provider, model_name, system_instructions, configuration, created_by
  ) VALUES (
    a.organization_id, a.id, next_version, a.name, a.description,
    a.model_provider, a.model_name, a.system_instructions,
    jsonb_build_object(
      'agent_type', a.agent_type,
      'language', a.language,
      'temperature', a.temperature,
      'voice_name', a.voice_name,
      'fallback_message', a.fallback_message,
      'handoff_enabled', a.handoff_enabled,
      'instruction_sections', a.instruction_sections
    ),
    auth.uid()
  ) RETURNING * INTO v;

  UPDATE public.agents
    SET version = next_version, published_at = now(), status = 'active', updated_at = now()
  WHERE id = _agent_id;

  INSERT INTO public.audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
  VALUES (a.organization_id, auth.uid(), 'agent.published', 'agent', a.id,
          jsonb_build_object('version_number', next_version, 'agent_version_id', v.id));

  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rotate_channel_api_key(_channel_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  target public.channels;
  plain_key text;
BEGIN
  SELECT * INTO target FROM public.channels WHERE id = _channel_id;
  IF target.id IS NULL OR NOT private.can_write_org(target.organization_id) THEN
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
$function$;

REVOKE ALL ON FUNCTION public.publish_agent(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rotate_channel_api_key(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_agent(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rotate_channel_api_key(uuid) TO authenticated, service_role;