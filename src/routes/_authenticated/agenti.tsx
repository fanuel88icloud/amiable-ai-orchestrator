import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ResourceList } from "@/components/common/ResourceList";
import { CreateAgentDialog } from "@/components/agents/CreateAgentDialog";
import { NoOrganizationState } from "@/components/organization/NoOrganizationState";
import { useOrganization } from "@/hooks/useOrganization";
import { fetchAgents } from "@/services/entities";
import { AGENT_TYPE_LABELS } from "@/config/agents";

export const Route = createFileRoute("/_authenticated/agenti")({
  head: () => ({
    meta: [
      { title: "Agenti AI | FMS AI Platform" },
      {
        name: "description",
        content: "Gestione degli agenti AI dell'organizzazione: creazione, stato e configurazione.",
      },
      { property: "og:title", content: "Agenti AI | FMS AI Platform" },
      {
        property: "og:description",
        content: "Elenco e creazione degli agenti AI dell'organizzazione attiva.",
      },
    ],
  }),
  component: AgentiPage,
});

function AgentiPage() {
  const { organizationId, user, can, isLoading: orgLoading } = useOrganization();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["org-data", organizationId, "agents"],
    queryFn: () => fetchAgents(organizationId!),
    enabled: Boolean(organizationId),
  });

  if (!orgLoading && !organizationId) {
    return (
      <>
        <PageHeader title="Agenti AI" description="Agenti dell'organizzazione attiva." />
        <NoOrganizationState />
      </>
    );
  }

  const canWrite = can("resources:write");
  const createDialog = organizationId ? (
    <CreateAgentDialog
      organizationId={organizationId}
      userId={user.id}
      disabled={!canWrite}
      onCreated={(agentId) => navigate({ to: "/agenti/$agentId", params: { agentId } })}
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="Agenti AI"
        description="Elenco degli agenti dell'organizzazione attiva."
        actions={canWrite ? createDialog : undefined}
      />
      <ResourceList
        isLoading={orgLoading || query.isLoading}
        metaLabel="Tipo"
        rows={(query.data ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          createdAt: a.created_at,
          meta: AGENT_TYPE_LABELS[a.agent_type] ?? a.agent_type,
        }))}
        onRowClick={(row) => navigate({ to: "/agenti/$agentId", params: { agentId: row.id } })}
        emptyIcon={Bot}
        emptyTitle="Nessun agente configurato"
        emptyDescription="Crea il primo agente dell'organizzazione. Potrai collegarlo a canali e tool nei passaggi successivi."
        emptyAction={canWrite ? createDialog : undefined}
      />
    </>
  );
}
