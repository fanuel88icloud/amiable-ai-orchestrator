CREATE POLICY "Members can read email attachments objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'email-attachments'
  AND EXISTS (
    SELECT 1 FROM public.email_attachments a
    WHERE a.storage_path = storage.objects.name
      AND public.is_org_member(a.organization_id)
  )
);