import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ResourceList } from "@/components/common/ResourceList";
import { CreateResourceDialog } from "@/components/common/CreateResourceDialog";
import { NoOrganizationState } from "@/components/organization/NoOrganizationState";
import { useOrganization } from "@/hooks/useOrganization";
import { createAgent, fetchAgents } from "@/services/entities";

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
  const createDialog = (
    <CreateResourceDialog
      title="Nuovo agente"
      description="Definisci un agente. La configurazione operativa arriverà nei prossimi moduli."
      triggerLabel="Nuovo agente"
      disabled={!canWrite}
      queryKey={["org-data", organizationId, "agents"]}
      onSubmit={({ name, description }) =>
        createAgent({ organizationId: organizationId!, userId: user.id, name, description })
      }
    />
  );

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
          meta: a.agent_type,
        }))}
        emptyIcon={Bot}
        emptyTitle="Nessun agente configurato"
        emptyDescription="Crea il primo agente dell'organizzazione. Potrai collegarlo a canali e tool nei passaggi successivi."
        emptyAction={canWrite ? createDialog : undefined}
      />
    </>
  );
}
