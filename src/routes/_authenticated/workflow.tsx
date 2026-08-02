import { createFileRoute } from "@tanstack/react-router";
import { GitBranch, Timer, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const Route = createFileRoute("/_authenticated/workflow")({
  head: () => ({
    meta: [
      { title: "Workflow | FMS AI Platform" },
      {
        name: "description",
        content: "Orchestrazione dei processi automatizzati tra agenti, canali e tool nella piattaforma FMS AI.",
      },
      { property: "og:title", content: "Workflow | FMS AI Platform" },
      {
        property: "og:description",
        content: "Definisci sequenze, condizioni e approvazioni per i processi automatizzati.",
      },
    ],
  }),
  component: WorkflowPage,
});

function WorkflowPage() {
  return (
    <>
      <PageHeader
        title="Workflow"
        description="Sequenze di passaggi che collegheranno agenti, canali e tool."
      />
      <ModulePlaceholder
        blocks={[
          { title: "Flussi", description: "Passaggi, condizioni e diramazioni.", icon: GitBranch },
          { title: "Pianificazioni", description: "Esecuzioni ricorrenti e trigger.", icon: Timer },
          { title: "Approvazioni", description: "Passaggi con supervisione umana.", icon: ShieldCheck },
        ]}
      />
    </>
  );
}
