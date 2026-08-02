-- ============ ENUMS ============
CREATE TYPE public.org_status AS ENUM ('active','suspended','trial');
CREATE TYPE public.org_role AS ENUM ('owner','admin','manager','operator','viewer');
CREATE TYPE public.member_status AS ENUM ('invited','active','suspended');
CREATE TYPE public.entity_status AS ENUM ('draft','active','paused','archived');
CREATE TYPE public.channel_type AS ENUM ('voice','whatsapp','email','webchat','api');
CREATE TYPE public.tool_type AS ENUM ('api','function','database','webhook','internal');

-- ============ ORGANIZATIONS ============
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  status public.org_status NOT NULL DEFAULT 'trial',
  timezone TEXT NOT NULL DEFAULT 'Europe/Rome',
  locale TEXT NOT NULL DEFAULT 'it-IT',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.org_role NOT NULL DEFAULT 'viewer',
  status public.member_status NOT NULL DEFAULT 'active',
  invited_by UUID,
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);

-- active org on profile
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.is_org_member(_org UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _org AND m.user_id = auth.uid() AND m.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org UUID, _roles public.org_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _org AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org(_org UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_org_role(_org, ARRAY['owner','admin']::public.org_role[])
$$;

CREATE OR REPLACE FUNCTION public.can_write_org(_org UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_org_role(_org, ARRAY['owner','admin','manager']::public.org_role[])
$$;

-- ============ ORG POLICIES ============
CREATE POLICY "Members can view their organizations" ON public.organizations
  FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY "Authenticated users can create organizations" ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Owners and admins can update the organization" ON public.organizations
  FOR UPDATE TO authenticated USING (public.can_manage_org(id)) WITH CHECK (public.can_manage_org(id));
CREATE POLICY "Owners can delete the organization" ON public.organizations
  FOR DELETE TO authenticated USING (public.has_org_role(id, ARRAY['owner']::public.org_role[]));

-- ============ MEMBER POLICIES ============
CREATE POLICY "Members can view members of their organizations" ON public.organization_members
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_org_member(organization_id));
CREATE POLICY "Owners and admins can invite members" ON public.organization_members
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_org(organization_id));
CREATE POLICY "Owners and admins can update members" ON public.organization_members
  FOR UPDATE TO authenticated USING (public.can_manage_org(organization_id)) WITH CHECK (public.can_manage_org(organization_id));
CREATE POLICY "Owners and admins can remove members" ON public.organization_members
  FOR DELETE TO authenticated USING (public.can_manage_org(organization_id));

-- prevent self role escalation / self demote of role by the member themself
CREATE OR REPLACE FUNCTION public.guard_member_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NEW.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Non puoi modificare il tuo stesso ruolo';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_member_role BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_member_role_change();

CREATE OR REPLACE FUNCTION public.guard_last_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owners INT;
BEGIN
  IF OLD.role = 'owner' AND (TG_OP = 'DELETE' OR NEW.role <> 'owner' OR NEW.status <> 'active') THEN
    SELECT count(*) INTO owners FROM public.organization_members
      WHERE organization_id = OLD.organization_id AND role = 'owner' AND status = 'active' AND id <> OLD.id;
    IF owners = 0 THEN
      RAISE EXCEPTION 'Ogni organizzazione deve avere almeno un proprietario';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER trg_guard_last_owner BEFORE UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_owner();

-- creator becomes owner automatically
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role, status, accepted_at)
  VALUES (NEW.id, NEW.created_by, 'owner', 'active', now())
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  UPDATE public.profiles SET active_organization_id = NEW.id
    WHERE id = NEW.created_by AND active_organization_id IS NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_new_organization AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();

-- ============ TENANT TABLES ============
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status public.entity_status NOT NULL DEFAULT 'draft',
  agent_type TEXT NOT NULL DEFAULT 'assistant',
  model_provider TEXT,
  model_name TEXT,
  system_instructions TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_agents_org ON public.agents(organization_id);

CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel_type public.channel_type NOT NULL,
  provider TEXT,
  status public.entity_status NOT NULL DEFAULT 'draft',
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  credentials_ref TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_channels_org ON public.channels(organization_id);

CREATE TABLE public.tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tool_type public.tool_type NOT NULL DEFAULT 'api',
  status public.entity_status NOT NULL DEFAULT 'draft',
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  credentials_ref TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tools TO authenticated;
GRANT ALL ON public.tools TO service_role;
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tools_org ON public.tools(organization_id);

CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status public.entity_status NOT NULL DEFAULT 'draft',
  trigger_type TEXT,
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO authenticated;
GRANT ALL ON public.workflows TO service_role;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_workflows_org ON public.workflows(organization_id);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_org ON public.audit_logs(organization_id, created_at DESC);

-- tenant policies
CREATE POLICY "Members read agents" ON public.agents FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Managers create agents" ON public.agents FOR INSERT TO authenticated WITH CHECK (public.can_write_org(organization_id) AND created_by = auth.uid());
CREATE POLICY "Managers update agents" ON public.agents FOR UPDATE TO authenticated USING (public.can_write_org(organization_id)) WITH CHECK (public.can_write_org(organization_id));
CREATE POLICY "Admins delete agents" ON public.agents FOR DELETE TO authenticated USING (public.can_manage_org(organization_id));

CREATE POLICY "Members read channels" ON public.channels FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Managers create channels" ON public.channels FOR INSERT TO authenticated WITH CHECK (public.can_write_org(organization_id) AND created_by = auth.uid());
CREATE POLICY "Managers update channels" ON public.channels FOR UPDATE TO authenticated USING (public.can_write_org(organization_id)) WITH CHECK (public.can_write_org(organization_id));
CREATE POLICY "Admins delete channels" ON public.channels FOR DELETE TO authenticated USING (public.can_manage_org(organization_id));

CREATE POLICY "Members read tools" ON public.tools FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Managers create tools" ON public.tools FOR INSERT TO authenticated WITH CHECK (public.can_write_org(organization_id) AND created_by = auth.uid());
CREATE POLICY "Managers update tools" ON public.tools FOR UPDATE TO authenticated USING (public.can_write_org(organization_id)) WITH CHECK (public.can_write_org(organization_id));
CREATE POLICY "Admins delete tools" ON public.tools FOR DELETE TO authenticated USING (public.can_manage_org(organization_id));

CREATE POLICY "Members read workflows" ON public.workflows FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Managers create workflows" ON public.workflows FOR INSERT TO authenticated WITH CHECK (public.can_write_org(organization_id) AND created_by = auth.uid());
CREATE POLICY "Managers update workflows" ON public.workflows FOR UPDATE TO authenticated USING (public.can_write_org(organization_id)) WITH CHECK (public.can_write_org(organization_id));
CREATE POLICY "Admins delete workflows" ON public.workflows FOR DELETE TO authenticated USING (public.can_manage_org(organization_id));

-- audit logs: append only, no update/delete policies at all
CREATE POLICY "Admins read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.can_manage_org(organization_id));
CREATE POLICY "Members append audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id) AND (user_id IS NULL OR user_id = auth.uid()));

-- updated_at triggers
CREATE TRIGGER trg_org_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_members_updated BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agents_updated BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_channels_updated BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tools_updated BEFORE UPDATE ON public.tools FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_workflows_updated BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ensure the auth signup trigger exists (profiles + default role)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();