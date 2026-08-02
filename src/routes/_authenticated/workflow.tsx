import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Workflow as WorkflowIcon } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ResourceList } from "@/components/common/ResourceList";
import { CreateResourceDialog } from "@/components/common/CreateResourceDialog";
import { NoOrganizationState } from "@/components/organization/NoOrganizationState";
import { useOrganization } from "@/hooks/useOrganization";
import { createWorkflow, fetchWorkflows } from "@/services/entities";

export const Route = createFileRoute("/_authenticated/workflow")({
  head: () => ({
    meta: [
      { title: "Workflow | FMS AI Platform" },
      {
        name: "description",
        content: "Orchestrazione dei processi automatizzati dell'organizzazione.",
      },
      { property: "og:title", content: "Workflow | FMS AI Platform" },
      {
        property: "og:description",
        content: "Definisci i workflow che coordinano agenti, canali e tool.",
      },
    ],
  }),
  component: WorkflowPage,
});

const TRIGGERS = [
  { value: "manual", label: "Manuale" },
  { value: "event", label: "Evento" },
  { value: "schedule", label: "Pianificato" },
  { value: "webhook", label: "Webhook" },
];

function WorkflowPage() {
  const { organizationId, user, can, isLoading: orgLoading } = useOrganization();

  const query = useQuery({
    queryKey: ["org-data", organizationId, "workflows"],
    queryFn: () => fetchWorkflows(organizationId!),
    enabled: Boolean(organizationId),
  });

  if (!orgLoading && !organizationId) {
    return (
      <>
        <PageHeader title="Workflow" description="Workflow dell'organizzazione attiva." />
        <NoOrganizationState />
      </>
    );
  }

  const canWrite = can("resources:write");
  const createDialog = (
    <CreateResourceDialog
      title="Nuovo workflow"
      description="Definisci nome e trigger. La logica di esecuzione arriverà nei prossimi moduli."
      triggerLabel="Nuovo workflow"
      disabled={!canWrite}
      select={{ label: "Trigger", defaultValue: "manual", options: TRIGGERS }}
      queryKey={["org-data", organizationId, "workflows"]}
      onSubmit={({ name, description, select }) =>
        createWorkflow({
          organizationId: organizationId!,
          userId: user.id,
          name,
          description,
          triggerType: select,
        })
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Workflow"
        description="Elenco dei workflow dell'organizzazione attiva."
        actions={canWrite ? createDialog : undefined}
      />
      <ResourceList
        isLoading={orgLoading || query.isLoading}
        metaLabel="Trigger"
        rows={(query.data ?? []).map((w) => ({
          id: w.id,
          name: w.name,
          status: w.status,
          createdAt: w.created_at,
          meta: TRIGGERS.find((t) => t.value === w.trigger_type)?.label ?? w.trigger_type,
        }))}
        emptyIcon={WorkflowIcon}
        emptyTitle="Nessun workflow definito"
        emptyDescription="Crea il primo workflow per orchestrare i processi dell'organizzazione."
        emptyAction={canWrite ? createDialog : undefined}
      />
    </>
  );
}
