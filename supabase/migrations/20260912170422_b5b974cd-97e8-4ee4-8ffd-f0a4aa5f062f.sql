CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_org_member(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _org AND m.user_id = auth.uid() AND m.status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION private.has_org_role(_org uuid, _roles public.org_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _org AND m.user_id = auth.uid()
      AND m.status = 'active' AND m.role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION private.can_manage_org(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_org_role(_org, ARRAY['owner','admin']::public.org_role[])
$$;

CREATE OR REPLACE FUNCTION private.can_write_org(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_org_role(_org, ARRAY['owner','admin','manager']::public.org_role[])
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM public;
REVOKE ALL ON FUNCTION private.is_org_member(uuid) FROM public;
REVOKE ALL ON FUNCTION private.has_org_role(uuid, public.org_role[]) FROM public;
REVOKE ALL ON FUNCTION private.can_manage_org(uuid) FROM public;
REVOKE ALL ON FUNCTION private.can_write_org(uuid) FROM public;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid, public.org_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_org(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_write_org(uuid) TO authenticated, service_role;

DO $do$
DECLARE
  r record;
  q text;
  c text;
  stmt text;
  roles text;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, cl.relname AS tbl, pol.polname AS name, pol.polcmd AS cmd,
           pg_get_expr(pol.polqual, pol.polrelid) AS qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS chk,
           pol.polroles
    FROM pg_policy pol
    JOIN pg_class cl ON cl.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE coalesce(pg_get_expr(pol.polqual, pol.polrelid),'') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),'')
          ~ '(is_org_member|has_org_role|can_manage_org|can_write_org|has_role)\('
  LOOP
    q := r.qual; c := r.chk;
    q := regexp_replace(q, '(^|[^a-z_.])(is_org_member|has_org_role|can_manage_org|can_write_org|has_role)\(', '\1private.\2(', 'g');
    c := regexp_replace(c, '(^|[^a-z_.])(is_org_member|has_org_role|can_manage_org|can_write_org|has_role)\(', '\1private.\2(', 'g');
    SELECT string_agg(quote_ident(rolname), ', ') INTO roles
      FROM pg_roles WHERE oid = ANY(r.polroles);
    IF roles IS NULL THEN roles := 'public'; END IF;

    EXECUTE format('DROP POLICY %I ON %I.%I', r.name, r.sch, r.tbl);
    stmt := format('CREATE POLICY %I ON %I.%I FOR %s TO %s', r.name, r.sch, r.tbl,
      CASE r.cmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END,
      roles);
    IF q IS NOT NULL THEN stmt := stmt || format(' USING (%s)', q); END IF;
    IF c IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', c); END IF;
    EXECUTE stmt;
  END LOOP;
END
$do$;