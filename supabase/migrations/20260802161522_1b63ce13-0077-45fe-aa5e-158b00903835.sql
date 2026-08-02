REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.has_org_role(uuid, public.org_role[]) FROM anon, public;
REVOKE ALL ON FUNCTION public.can_manage_org(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.can_write_org(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, public.org_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.handle_new_organization() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.guard_member_role_change() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.guard_last_owner() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;