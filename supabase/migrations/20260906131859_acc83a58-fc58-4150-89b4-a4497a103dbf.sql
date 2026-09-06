-- 1. AGENTS: extend
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS model_provider text NOT NULL DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS model_name text NOT NULL DEFAULT 'openai/gpt-5.4-mini',
  ADD COLUMN IF NOT EXISTS temperature numeric,
  ADD COLUMN IF NOT EXISTS voice_name text,
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'it',
  ADD COLUMN IF NOT EXISTS fallback_message text,
  ADD COLUMN IF NOT EXISTS handoff_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS instruction_sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_tested_at timestamptz;

COMMENT ON COLUMN public.agents.model_name IS 'Model identifier from public.ai_models. Never store API keys in this table.';

-- 2. AI MODEL REGISTRY (shared, read-only for users)
CREATE TABLE IF NOT EXISTS public.ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model_name text NOT NULL,
  label text NOT NULL,
  description text,
  supports_temperature boolean NOT NULL DEFAULT false,
  input_cost_per_million numeric,
  output_cost_per_million numeric,
  currency text NOT NULL DEFAULT 'EUR',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model_name)
);
GRANT SELECT ON public.ai_models TO authenticated;
GRANT ALL ON public.ai_models TO service_role;
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_models readable by authenticated"
  ON public.ai_models FOR SELECT TO authenticated USING (is_active);

INSERT INTO public.ai_models (provider, model_name, label, description, supports_temperature, input_cost_per_million, output_cost_per_million, sort_order) VALUES
  ('openai', 'openai/gpt-5.4-mini', 'GPT-5.4 Mini', 'Equilibrio tra qualita e costo, adatto alla maggior parte degli agenti.', false, 0.25, 2.00, 10),
  ('openai', 'openai/gpt-5.4', 'GPT-5.4', 'Modello di punta per ragionamenti complessi.', false, 1.25, 10.00, 20),
  ('openai', 'openai/gpt-5.4-nano', 'GPT-5.4 Nano', 'Il piu rapido ed economico, per compiti semplici.', false, 0.05, 0.40, 30),
  ('openai', 'openai/gpt-5.6-terra', 'GPT-5.6 Terra', 'Generazione piu recente, ottimo rapporto qualita/prezzo.', false, 1.00, 8.00, 40)
ON CONFLICT (provider, model_name) DO NOTHING;

-- 3. AGENT VERSIONS (immutable)
CREATE TABLE IF NOT EXISTS public.agent_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  name text NOT NULL,
  description text,
  model_provider text NOT NULL,
  model_name text NOT NULL,
  system_instructions text,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, version_number)
);
GRANT SELECT ON public.agent_versions TO authenticated;
GRANT ALL ON public.agent_versions TO service_role;
ALTER TABLE public.agent_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_versions readable by org members"
  ON public.agent_versions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
-- No INSERT/UPDATE/DELETE policies: versions are created only by the
-- security-definer publish function and can never be mutated.

CREATE OR REPLACE FUNCTION public.block_agent_version_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Le versioni pubblicate sono immutabili';
END;
$$;
DROP TRIGGER IF EXISTS agent_versions_immutable ON public.agent_versions;
CREATE TRIGGER agent_versions_immutable
  BEFORE UPDATE OR DELETE ON public.agent_versions
  FOR EACH ROW EXECUTE FUNCTION public.block_agent_version_mutation();

-- 4. AGENT TOOLS
CREATE TABLE IF NOT EXISTS public.agent_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tool_id uuid NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, tool_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_tools TO authenticated;
GRANT ALL ON public.agent_tools TO service_role;
ALTER TABLE public.agent_tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_tools readable by org members"
  ON public.agent_tools FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "agent_tools writable by org writers"
  ON public.agent_tools FOR INSERT TO authenticated WITH CHECK (public.can_write_org(organization_id));
CREATE POLICY "agent_tools updatable by org writers"
  ON public.agent_tools FOR UPDATE TO authenticated
  USING (public.can_write_org(organization_id)) WITH CHECK (public.can_write_org(organization_id));
CREATE POLICY "agent_tools deletable by org writers"
  ON public.agent_tools FOR DELETE TO authenticated USING (public.can_write_org(organization_id));

-- 5. TEST SESSIONS / MESSAGES
CREATE TABLE IF NOT EXISTS public.agent_test_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  agent_version_id uuid REFERENCES public.agent_versions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.agent_test_sessions TO authenticated;
GRANT ALL ON public.agent_test_sessions TO service_role;
ALTER TABLE public.agent_test_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test sessions readable by org members"
  ON public.agent_test_sessions FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "test sessions created by org members"
  ON public.agent_test_sessions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "test sessions updatable by creator"
  ON public.agent_test_sessions FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id) AND created_by = auth.uid())
  WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.agent_test_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.agent_test_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_test_messages_session_idx ON public.agent_test_messages (session_id, created_at);
GRANT SELECT ON public.agent_test_messages TO authenticated;
GRANT ALL ON public.agent_test_messages TO service_role;
ALTER TABLE public.agent_test_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test messages readable by org members"
  ON public.agent_test_messages FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
-- Messages are written exclusively by the authenticated backend function.

-- 6. TEST RUN LOG (cost / usage)
CREATE TABLE IF NOT EXISTS public.agent_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  agent_version_id uuid REFERENCES public.agent_versions(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.agent_test_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model_name text NOT NULL,
  duration_ms integer,
  status text NOT NULL,
  error_message text,
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric,
  currency text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_test_runs_org_idx ON public.agent_test_runs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_test_runs_rate_idx ON public.agent_test_runs (user_id, created_at DESC);
GRANT SELECT ON public.agent_test_runs TO authenticated;
GRANT ALL ON public.agent_test_runs TO service_role;
ALTER TABLE public.agent_test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test runs readable by org members"
  ON public.agent_test_runs FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

-- 7. CONFIGURABLE LIMITS
CREATE TABLE IF NOT EXISTS public.organization_limits (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  max_messages_per_session integer NOT NULL DEFAULT 40,
  max_characters_per_message integer NOT NULL DEFAULT 4000,
  request_timeout_ms integer NOT NULL DEFAULT 60000,
  max_tests_per_minute integer NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organization_limits TO authenticated;
GRANT ALL ON public.organization_limits TO service_role;
ALTER TABLE public.organization_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "limits readable by org members"
  ON public.organization_limits FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "limits managed by org admins"
  ON public.organization_limits FOR ALL TO authenticated
  USING (public.can_manage_org(organization_id)) WITH CHECK (public.can_manage_org(organization_id));

CREATE TRIGGER update_organization_limits_updated_at
  BEFORE UPDATE ON public.organization_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. PUBLISH FUNCTION
CREATE OR REPLACE FUNCTION public.publish_agent(_agent_id uuid)
RETURNS public.agent_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.agents;
  v public.agent_versions;
  next_version integer;
BEGIN
  SELECT * INTO a FROM public.agents WHERE id = _agent_id;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente non trovato';
  END IF;
  IF NOT public.can_write_org(a.organization_id) THEN
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
$$;
REVOKE ALL ON FUNCTION public.publish_agent(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.publish_agent(uuid) TO authenticated;