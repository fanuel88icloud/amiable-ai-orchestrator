import { supabase } from "@/integrations/supabase/client";
import type {
  Agent,
  AgentTool,
  AgentVersion,
  AiModel,
  TestMessage,
  TestRun,
  TestSession,
} from "@/types/platform";
import { buildSystemInstructions, type AgentTemplate } from "@/config/agents";

/** Tenant-scoped data access for agents. RLS enforces the same boundary server-side. */

export async function fetchAgent(agentId: string): Promise<Agent> {
  const { data, error } = await supabase.from("agents").select("*").eq("id", agentId).single();
  if (error) throw error;
  return data;
}

export async function updateAgent(agentId: string, patch: Partial<Agent>) {
  const { error } = await supabase.from("agents").update(patch).eq("id", agentId);
  if (error) throw error;
}

export async function createAgentFull(input: Omit<Agent, "id" | "created_at" | "updated_at">) {
  const { data, error } = await supabase.from("agents").insert(input).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function createAgentFromTemplate(input: {
  organizationId: string;
  userId: string;
  name: string;
  template: AgentTemplate;
}) {
  const { template } = input;
  const { data, error } = await supabase
    .from("agents")
    .insert({
      organization_id: input.organizationId,
      created_by: input.userId,
      name: input.name.trim(),
      description: template.description,
      agent_type: template.agentType,
      language: template.language,
      fallback_message: template.fallbackMessage,
      handoff_enabled: template.handoffEnabled,
      instruction_sections: template.sections,
      system_instructions: buildSystemInstructions(template.sections, template.fallbackMessage),
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function fetchAiModels(): Promise<AiModel[]> {
  const { data, error } = await supabase
    .from("ai_models")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAgentVersions(agentId: string): Promise<AgentVersion[]> {
  const { data, error } = await supabase
    .from("agent_versions")
    .select("*")
    .eq("agent_id", agentId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Creates a new immutable version, bumps the counter and writes the audit entry. */
export async function publishAgent(agentId: string): Promise<AgentVersion> {
  const { data, error } = await supabase.rpc("publish_agent", { _agent_id: agentId });
  if (error) throw error;
  return data as unknown as AgentVersion;
}

export async function fetchAgentTools(agentId: string): Promise<AgentTool[]> {
  const { data, error } = await supabase.from("agent_tools").select("*").eq("agent_id", agentId);
  if (error) throw error;
  return data ?? [];
}

export async function setAgentTool(input: {
  organizationId: string;
  agentId: string;
  toolId: string;
  enabled: boolean;
}) {
  if (!input.enabled) {
    const { error } = await supabase
      .from("agent_tools")
      .delete()
      .eq("agent_id", input.agentId)
      .eq("tool_id", input.toolId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("agent_tools").upsert(
    {
      organization_id: input.organizationId,
      agent_id: input.agentId,
      tool_id: input.toolId,
      is_enabled: true,
    },
    { onConflict: "agent_id,tool_id" },
  );
  if (error) throw error;
}

export async function createTestSession(input: {
  organizationId: string;
  agentId: string;
  agentVersionId: string | null;
  userId: string;
}): Promise<TestSession> {
  const { data, error } = await supabase
    .from("agent_test_sessions")
    .insert({
      organization_id: input.organizationId,
      agent_id: input.agentId,
      agent_version_id: input.agentVersionId,
      created_by: input.userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchTestMessages(sessionId: string): Promise<TestMessage[]> {
  const { data, error } = await supabase
    .from("agent_test_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchTestRuns(agentId: string, limit = 20): Promise<TestRun[]> {
  const { data, error } = await supabase
    .from("agent_test_runs")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export type AgentTestResult = {
  assistantMessage: TestMessage;
  run: TestRun;
};

export async function sendAgentTestMessage(input: {
  sessionId: string;
  message: string;
}): Promise<AgentTestResult> {
  const { data, error } = await supabase.functions.invoke("test-agent", {
    body: { sessionId: input.sessionId, message: input.message },
  });
  if (error) throw error;
  if (!data?.assistantMessage || !data?.run) {
    throw new Error("Risposta del simulatore non valida");
  }
  return data as AgentTestResult;
}
