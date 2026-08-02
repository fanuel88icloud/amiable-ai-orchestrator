import { createFileRoute } from "@tanstack/react-router";
import { Plug, Database, Calendar, Webhook } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const Route = createFileRoute("/_authenticated/tool")({
  head: () => ({
    meta: [
      { title: "Tool | FMS AI Platform" },
      {
        name: "description",
        content: "Catalogo dei tool e delle integrazioni disponibili agli agenti della piattaforma FMS AI.",
      },
      { property: "og:title", content: "Tool | FMS AI Platform" },
      {
        property: "og:description",
        content: "Integrazioni, funzioni e connettori richiamabili dagli agenti.",
      },
    ],
  }),
  component: ToolPage,
});

function ToolPage() {
  return (
    <>
      <PageHeader
        title="Tool"
        description="Catalogo delle capacità che gli agenti potranno richiamare."
      />
      <ModulePlaceholder
        blocks={[
          { title: "Connettori API", description: "Chiamate verso sistemi esterni.", icon: Plug },
          { title: "Basi dati", description: "Lettura e scrittura su archivi interni.", icon: Database },
          { title: "Calendario", description: "Disponibilità e appuntamenti.", icon: Calendar },
          { title: "Webhook", description: "Eventi in uscita verso terze parti.", icon: Webhook },
        ]}
      />
    </>
  );
}
