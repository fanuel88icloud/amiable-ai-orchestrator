import type { Database } from "@/integrations/supabase/types";

export type Tables = Database["public"]["Tables"];
export type Enums = Database["public"]["Enums"];

export type Organization = Tables["organizations"]["Row"];
export type OrganizationMember = Tables["organization_members"]["Row"];
export type Agent = Tables["agents"]["Row"];
export type Channel = Tables["channels"]["Row"];
export type Tool = Tables["tools"]["Row"];
export type Workflow = Tables["workflows"]["Row"];
export type AuditLog = Tables["audit_logs"]["Row"];
export type AgentVersion = Tables["agent_versions"]["Row"];
export type AgentTool = Tables["agent_tools"]["Row"];
export type AiModel = Tables["ai_models"]["Row"];
export type TestSession = Tables["agent_test_sessions"]["Row"];
export type TestMessage = Tables["agent_test_messages"]["Row"];
export type TestRun = Tables["agent_test_runs"]["Row"];
export type OrganizationLimits = Tables["organization_limits"]["Row"];

export type OrgRole = Enums["org_role"];
export type OrgStatus = Enums["org_status"];
export type MemberStatus = Enums["member_status"];
export type EntityStatus = Enums["entity_status"];
export type ChannelType = Enums["channel_type"];
export type ToolType = Enums["tool_type"];

/** Membership joined with its organization, as returned by the org service. */
export type Membership = OrganizationMember & { organization: Organization };

/**
 * Extensible permission model. UI checks are a convenience only:
 * the database enforces the same rules through RLS policies.
 */
export type Permission =
  | "org:view"
  | "org:update"
  | "org:delete"
  | "members:view"
  | "members:manage"
  | "resources:view"
  | "resources:write"
  | "resources:delete"
  | "audit:view";

export const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  owner: [
    "org:view",
    "org:update",
    "org:delete",
    "members:view",
    "members:manage",
    "resources:view",
    "resources:write",
    "resources:delete",
    "audit:view",
  ],
  admin: [
    "org:view",
    "org:update",
    "members:view",
    "members:manage",
    "resources:view",
    "resources:write",
    "resources:delete",
    "audit:view",
  ],
  manager: ["org:view", "members:view", "resources:view", "resources:write"],
  operator: ["org:view", "members:view", "resources:view"],
  viewer: ["org:view", "resources:view"],
};

export function roleHas(role: OrgRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Proprietario",
  admin: "Amministratore",
  manager: "Manager",
  operator: "Operatore",
  viewer: "Osservatore",
};

export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: "Controllo completo, inclusa eliminazione dell'organizzazione.",
  admin: "Gestisce impostazioni, membri e tutte le risorse.",
  manager: "Crea e modifica agenti, canali, tool e workflow.",
  operator: "Consulta risorse e opera sulle attività quotidiane.",
  viewer: "Accesso in sola lettura alle risorse.",
};

export const ENTITY_STATUS_LABELS: Record<EntityStatus, string> = {
  draft: "Bozza",
  active: "Attivo",
  paused: "In pausa",
  archived: "Archiviato",
};

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  active: "Attiva",
  suspended: "Sospesa",
  trial: "Prova",
};

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  invited: "Invitato",
  active: "Attivo",
  suspended: "Sospeso",
};

export const CHANNEL_TYPE_LABELS: Record<ChannelType, string> = {
  voice: "Voce",
  whatsapp: "WhatsApp",
  email: "Email",
  webchat: "Web chat",
  api: "API",
};

export const TOOL_TYPE_LABELS: Record<ToolType, string> = {
  api: "API",
  function: "Funzione",
  database: "Database",
  webhook: "Webhook",
  internal: "Interno",
};
