import { supabase } from "@/integrations/supabase/client";
import type { Membership, OrgRole, Organization } from "@/types/platform";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Every organization the signed-in user actively belongs to. RLS scopes the result. */
export async function fetchMemberships(): Promise<Membership[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("*, organization:organizations(*)")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).filter((row) => row.organization) as Membership[];
}

export async function fetchActiveOrganizationId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("active_organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.active_organization_id ?? null;
}

export async function setActiveOrganization(userId: string, organizationId: string) {
  const { error } = await supabase
    .from("profiles")
    .update({ active_organization_id: organizationId })
    .eq("id", userId);
  if (error) throw error;
}

export async function createOrganization(input: {
  name: string;
  slug?: string;
  userId: string;
}): Promise<Organization> {
  const slug = slugify(input.slug || input.name) || `org-${Date.now()}`;
  const { data, error } = await supabase
    .from("organizations")
    .insert({ name: input.name.trim(), slug, created_by: input.userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateOrganization(id: string, patch: Partial<Organization>) {
  const { error } = await supabase.from("organizations").update(patch).eq("id", id);
  if (error) throw error;
}

export async function fetchMembers(organizationId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Invites an existing platform user by id. Role changes are still enforced by RLS. */
export async function inviteMember(input: {
  organizationId: string;
  userId: string;
  role: OrgRole;
  invitedBy: string;
}) {
  const { error } = await supabase.from("organization_members").insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    role: input.role,
    status: "invited",
    invited_by: input.invitedBy,
    invited_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function updateMemberRole(memberId: string, role: OrgRole) {
  const { error } = await supabase.from("organization_members").update({ role }).eq("id", memberId);
  if (error) throw error;
}

export async function removeMember(memberId: string) {
  const { error } = await supabase.from("organization_members").delete().eq("id", memberId);
  if (error) throw error;
}
