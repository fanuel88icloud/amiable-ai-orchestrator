CREATE TABLE IF NOT EXISTS public.email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.channel_messages(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'attachment' CHECK (kind IN ('attachment','original_eml')),
  filename text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  storage_path text NOT NULL UNIQUE,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_attachments_message_idx
  ON public.email_attachments(message_id, created_at);
CREATE INDEX IF NOT EXISTS email_attachments_org_idx
  ON public.email_attachments(organization_id, created_at DESC);

ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.email_attachments TO authenticated;
GRANT ALL ON public.email_attachments TO service_role;

CREATE POLICY "email attachments readable by members" ON public.email_attachments
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('email-attachments', 'email-attachments', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

CREATE POLICY "email storage readable by members" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'email-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.email_attachments attachment
      WHERE attachment.storage_path = name
        AND public.is_org_member(attachment.organization_id)
    )
  );

COMMENT ON TABLE public.email_attachments IS
  'Private email files. PEC messages include the immutable original EML and SHA-256 digest.';
