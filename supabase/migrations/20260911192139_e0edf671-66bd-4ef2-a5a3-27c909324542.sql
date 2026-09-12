DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Members can read email attachments objects'
  ) THEN
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
  END IF;
END $$;
