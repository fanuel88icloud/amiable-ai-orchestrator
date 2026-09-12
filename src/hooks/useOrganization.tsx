import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

import {
  fetchActiveOrganizationId,
  fetchMemberships,
  setActiveOrganization,
} from "@/services/organizations";
import { roleHas, type Membership, type OrgRole, type Permission } from "@/types/platform";

type OrganizationContextValue = {
  user: User;
  memberships: Membership[];
  activeMembership: Membership | null;
  organizationId: string | null;
  role: OrgRole | null;
  isLoading: boolean;
  can: (permission: Permission) => boolean;
  switchOrganization: (organizationId: string) => void;
  refresh: () => void;
};

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ user, children }: { user: User; children: ReactNode }) {
  const queryClient = useQueryClient();

  const membershipsQuery = useQuery({
    queryKey: ["memberships", user.id],
    queryFn: fetchMemberships,
  });

  const activeIdQuery = useQuery({
    queryKey: ["active-organization", user.id],
    queryFn: () => fetchActiveOrganizationId(user.id),
  });

  const switchMutation = useMutation({
    mutationFn: (organizationId: string) => setActiveOrganization(user.id, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-organization", user.id] });
      queryClient.invalidateQueries({ queryKey: ["org-data"] });
    },
  });

  const memberships = useMemo(() => membershipsQuery.data ?? [], [membershipsQuery.data]);
  const activeMembership = useMemo(() => {
    if (memberships.length === 0) return null;
    return memberships.find((m) => m.organization_id === activeIdQuery.data) ?? memberships[0]!;
  }, [memberships, activeIdQuery.data]);

  const value: OrganizationContextValue = {
    user,
    memberships,
    activeMembership,
    organizationId: activeMembership?.organization_id ?? null,
    role: activeMembership?.role ?? null,
    isLoading: membershipsQuery.isLoading || activeIdQuery.isLoading,
    can: (permission) => roleHas(activeMembership?.role, permission),
    switchOrganization: (organizationId) => switchMutation.mutate(organizationId),
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: ["memberships", user.id] });
      queryClient.invalidateQueries({ queryKey: ["active-organization", user.id] });
    },
  };

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext);
  if (!ctx) throw new Error("useOrganization deve essere usato dentro OrganizationProvider");
  return ctx;
}
