ALTER TABLE public.channel_messages
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS provider_event_id text,
  ADD COLUMN IF NOT EXISTS in_reply_to text;

CREATE UNIQUE INDEX IF NOT EXISTS channel_messages_provider_message_idx
  ON public.channel_messages(channel_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS channel_messages_provider_event_idx
  ON public.channel_messages(channel_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

COMMENT ON COLUMN public.channel_messages.provider_message_id IS
  'Provider identifier used for email threading and idempotency.';
COMMENT ON COLUMN public.channel_messages.provider_event_id IS
  'Webhook delivery identifier used to discard at-least-once duplicates.';
