import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ResourceList } from "@/components/common/ResourceList";
import { CreateResourceDialog } from "@/components/common/CreateResourceDialog";
import { NoOrganizationState } from "@/components/organization/NoOrganizationState";
import { useOrganization } from "@/hooks/useOrganization";
import { createTool, fetchTools } from "@/services/entities";
import { TOOL_TYPE_LABELS, type ToolType } from "@/types/platform";

export const Route = createFileRoute("/_authenticated/tool")({
  head: () => ({
    meta: [
      { title: "Tool | FMS AI Platform" },
      {
        name: "description",
        content: "Strumenti e integrazioni disponibili agli agenti dell'organizzazione.",
      },
      { property: "og:title", content: "Tool | FMS AI Platform" },
      {
        property: "og:description",
        content: "Registra API, funzioni, webhook e integrazioni interne dell'organizzazione.",
      },
    ],
  }),
  component: ToolPage,
});

function ToolPage() {
  const { organizationId, user, can, isLoading: orgLoading } = useOrganization();

  const query = useQuery({
    queryKey: ["org-data", organizationId, "tools"],
    queryFn: () => fetchTools(organizationId!),
    enabled: Boolean(organizationId),
  });

  if (!orgLoading && !organizationId) {
    return (
      <>
        <PageHeader title="Tool" description="Tool dell'organizzazione attiva." />
        <NoOrganizationState />
      </>
    );
  }

  const canWrite = can("resources:write");
  const createDialog = (
    <CreateResourceDialog
      title="Nuovo tool"
      description="Le credenziali delle integrazioni non vengono salvate in chiaro nella configurazione."
      triggerLabel="Nuovo tool"
      disabled={!canWrite}
      select={{
        label: "Tipo di tool",
        defaultValue: "api",
        options: Object.entries(TOOL_TYPE_LABELS).map(([value, label]) => ({ value, label })),
      }}
      queryKey={["org-data", organizationId, "tools"]}
      onSubmit={({ name, description, select }) =>
        createTool({
          organizationId: organizationId!,
          userId: user.id,
          name,
          description,
          toolType: select as ToolType,
        })
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Tool"
        description="Elenco dei tool dell'organizzazione attiva."
        actions={canWrite ? createDialog : undefined}
      />
      <ResourceList
        isLoading={orgLoading || query.isLoading}
        metaLabel="Tipo"
        rows={(query.data ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
          createdAt: t.created_at,
          meta: TOOL_TYPE_LABELS[t.tool_type],
        }))}
        emptyIcon={Wrench}
        emptyTitle="Nessun tool registrato"
        emptyDescription="Registra il primo strumento che gli agenti potranno utilizzare durante le conversazioni."
        emptyAction={canWrite ? createDialog : undefined}
      />
    </>
  );
}
