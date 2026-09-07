import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/types/platform";

export type Conversation = Tables["channel_conversations"]["Row"] & {
  channel: Pick<Tables["channels"]["Row"], "name" | "channel_type"> | null;
};
export type ConversationMessage = Tables["channel_messages"]["Row"];
export type InboxMember = {
  user_id: string;
  role: string;
  status: string;
  profile: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

export async function fetchConversations(organizationId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("channel_conversations")
    .select("*,channel:channels(name,channel_type)")
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function fetchConversationMessages(
  conversationId: string,
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from("channel_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function invokeAction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("conversation-action", { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export async function fetchInboxMembers(organizationId: string): Promise<InboxMember[]> {
  const data = await invokeAction({ action: "list_members", organizationId });
  return (data?.members ?? []) as InboxMember[];
}

export async function conversationAction(input: {
  organizationId: string;
  conversationId: string;
  action: "assign" | "status" | "read" | "reply";
  assignedTo?: string | null;
  status?: "open" | "closed" | "handoff";
  message?: string;
}) {
  return invokeAction(input);
}
