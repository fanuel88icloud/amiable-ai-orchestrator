REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, public.org_role[]) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_org(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.can_write_org(uuid) FROM authenticated, anon, public;