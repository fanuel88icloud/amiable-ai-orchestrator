-- 1. Prevent privilege escalation to owner by admins
DROP POLICY IF EXISTS "Owners and admins can invite members" ON public.organization_members;
CREATE POLICY "Owners and admins can invite members"
ON public.organization_members FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_org(organization_id)
  AND (role <> 'owner'::public.org_role OR public.has_org_role(organization_id, ARRAY['owner']::public.org_role[]))
);

DROP POLICY IF EXISTS "Owners and admins can update members" ON public.organization_members;
CREATE POLICY "Owners and admins can update members"
ON public.organization_members FOR UPDATE TO authenticated
USING (
  public.can_manage_org(organization_id)
  AND (role <> 'owner'::public.org_role OR public.has_org_role(organization_id, ARRAY['owner']::public.org_role[]))
)
WITH CHECK (
  public.can_manage_org(organization_id)
  AND (role <> 'owner'::public.org_role OR public.has_org_role(organization_id, ARRAY['owner']::public.org_role[]))
);

DROP POLICY IF EXISTS "Owners and admins can remove members" ON public.organization_members;
CREATE POLICY "Owners and admins can remove members"
ON public.organization_members FOR DELETE TO authenticated
USING (
  public.can_manage_org(organization_id)
  AND (role <> 'owner'::public.org_role OR public.has_org_role(organization_id, ARRAY['owner']::public.org_role[]))
);

-- 2. Storage write policies for email-attachments bucket
DROP POLICY IF EXISTS "Members can upload email attachments objects" ON storage.objects;
CREATE POLICY "Members can upload email attachments objects"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'email-attachments'
  AND EXISTS (
    SELECT 1 FROM public.email_attachments a
    WHERE a.storage_path = name AND public.can_write_org(a.organization_id)
  )
);

DROP POLICY IF EXISTS "Members can update email attachments objects" ON storage.objects;
CREATE POLICY "Members can update email attachments objects"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'email-attachments'
  AND EXISTS (
    SELECT 1 FROM public.email_attachments a
    WHERE a.storage_path = name AND public.can_write_org(a.organization_id)
  )
)
WITH CHECK (
  bucket_id = 'email-attachments'
  AND EXISTS (
    SELECT 1 FROM public.email_attachments a
    WHERE a.storage_path = name AND public.can_write_org(a.organization_id)
  )
);

DROP POLICY IF EXISTS "Members can delete email attachments objects" ON storage.objects;
CREATE POLICY "Members can delete email attachments objects"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'email-attachments'
  AND EXISTS (
    SELECT 1 FROM public.email_attachments a
    WHERE a.storage_path = name AND public.can_write_org(a.organization_id)
  )
);

-- 3. Revoke EXECUTE on internal SECURITY DEFINER / trigger functions
REVOKE EXECUTE ON FUNCTION public.block_agent_version_mutation() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_last_owner() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_member_role_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_organization() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refresh_conversation_from_message() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.rotate_channel_api_key(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.publish_agent(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, public.org_role[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_org(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_write_org(uuid) FROM anon, public;