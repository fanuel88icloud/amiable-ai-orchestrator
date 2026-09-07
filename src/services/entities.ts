import { supabase } from "@/integrations/supabase/client";
import type {
  Agent,
  Channel,
  ChannelType,
  Tool,
  ToolType,
  Workflow,
  AuditLog,
} from "@/types/platform";

/**
 * Data access for tenant-scoped resources.
 * Every query filters by organization_id; RLS enforces the same boundary server-side.
 */

export async function fetchAgents(organizationId: string): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createAgent(input: {
  organizationId: string;
  userId: string;
  name: string;
  description?: string;
  agentType?: string;
}) {
  const { error } = await supabase.from("agents").insert({
    organization_id: input.organizationId,
    created_by: input.userId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    agent_type: input.agentType || "assistant",
  });
  if (error) throw error;
}

export async function fetchChannels(organizationId: string): Promise<Channel[]> {
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createChannel(input: {
  organizationId: string;
  userId: string;
  name: string;
  channelType: ChannelType;
  provider?: string;
}) {
  const { error } = await supabase.from("channels").insert({
    organization_id: input.organizationId,
    created_by: input.userId,
    name: input.name.trim(),
    channel_type: input.channelType,
    provider: input.provider?.trim() || null,
    // Secrets are never stored here: only a reference to a managed secret.
    configuration: {},
  });
  if (error) throw error;
}

export async function fetchChannel(channelId: string): Promise<Channel> {
  const { data, error } = await supabase.from("channels").select("*").eq("id", channelId).single();
  if (error) throw error;
  return data;
}

export async function updateChannel(input: {
  channelId: string;
  organizationId: string;
  name: string;
  channelType: ChannelType;
  status: Channel["status"];
  agentId: string | null;
  configuration: Channel["configuration"];
  provider?: string | null;
  credentialsRef?: string | null;
}) {
  const { data, error } = await supabase
    .from("channels")
    .update({
      name: input.name.trim(),
      channel_type: input.channelType,
      status: input.status,
      agent_id: input.agentId,
      configuration: input.configuration,
      provider: input.provider?.trim() || null,
      credentials_ref: input.credentialsRef?.trim() || null,
    })
    .eq("id", input.channelId)
    .eq("organization_id", input.organizationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function rotateChannelApiKey(channelId: string): Promise<string> {
  const { data, error } = await supabase.rpc("rotate_channel_api_key", { _channel_id: channelId });
  if (error) throw error;
  return data;
}

export async function sendChannelMessage(input: {
  publicId: string;
  sessionId: string;
  message: string;
  apiKey?: string;
}) {
  const { data, error } = await supabase.functions.invoke("channel-message", {
    body: { publicId: input.publicId, sessionId: input.sessionId, message: input.message },
    headers: input.apiKey ? { "x-channel-api-key": input.apiKey } : undefined,
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as { answer: string | null; conversationId: string; handoff?: boolean };
}

export async function fetchTools(organizationId: string): Promise<Tool[]> {
  const { data, error } = await supabase
    .from("tools")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTool(input: {
  organizationId: string;
  userId: string;
  name: string;
  description?: string;
  toolType: ToolType;
}) {
  const { error } = await supabase.from("tools").insert({
    organization_id: input.organizationId,
    created_by: input.userId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    tool_type: input.toolType,
    configuration: {},
  });
  if (error) throw error;
}

export async function fetchTool(toolId: string): Promise<Tool> {
  const { data, error } = await supabase.from("tools").select("*").eq("id", toolId).single();
  if (error) throw error;
  return data;
}

export async function updateTool(input: {
  toolId: string;
  organizationId: string;
  name: string;
  description?: string;
  toolType: ToolType;
  status: Tool["status"];
  configuration: Tool["configuration"];
  credentialsRef?: string;
}) {
  const { data, error } = await supabase
    .from("tools")
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      tool_type: input.toolType,
      status: input.status,
      configuration: input.configuration,
      credentials_ref: input.credentialsRef?.trim() || null,
    })
    .eq("id", input.toolId)
    .eq("organization_id", input.organizationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchWorkflows(organizationId: string): Promise<Workflow[]> {
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createWorkflow(input: {
  organizationId: string;
  userId: string;
  name: string;
  description?: string;
  triggerType?: string;
}) {
  const { error } = await supabase.from("workflows").insert({
    organization_id: input.organizationId,
    created_by: input.userId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    trigger_type: input.triggerType?.trim() || null,
    definition: {},
  });
  if (error) throw error;
}

export async function fetchAuditLogs(organizationId: string, limit = 100): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
