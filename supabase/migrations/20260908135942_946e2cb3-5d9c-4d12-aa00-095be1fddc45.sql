ALTER TABLE public.channel_conversations
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_address text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_preview text,
  ADD COLUMN IF NOT EXISTS handoff_reason text;

CREATE INDEX IF NOT EXISTS channel_conversations_inbox_idx
  ON public.channel_conversations(organization_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS channel_conversations_assignee_idx
  ON public.channel_conversations(organization_id, assigned_to, status);

ALTER TABLE public.channel_messages
  DROP CONSTRAINT IF EXISTS channel_messages_role_check;
ALTER TABLE public.channel_messages
  ADD CONSTRAINT channel_messages_role_check CHECK (role IN ('user','assistant','operator','tool','system')),
  ADD COLUMN IF NOT EXISTS sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.refresh_conversation_from_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.channel_conversations
  SET last_message_at = NEW.created_at,
      last_message_preview = left(NEW.content, 240),
      unread_count = CASE WHEN NEW.role = 'user' THEN unread_count + 1 ELSE unread_count END,
      updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_conversation_from_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS refresh_conversation_after_message ON public.channel_messages;
CREATE TRIGGER refresh_conversation_after_message
  AFTER INSERT ON public.channel_messages
  FOR EACH ROW EXECUTE FUNCTION public.refresh_conversation_from_message();

UPDATE public.channel_conversations c
SET (last_message_at, last_message_preview) = (
  SELECT m.created_at, left(m.content, 240)
  FROM public.channel_messages m
  WHERE m.conversation_id = c.id
  ORDER BY m.created_at DESC
  LIMIT 1
)
WHERE c.last_message_at IS NULL
  AND EXISTS (SELECT 1 FROM public.channel_messages m WHERE m.conversation_id = c.id);