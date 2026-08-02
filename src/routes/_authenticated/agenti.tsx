import { createFileRoute } from "@tanstack/react-router";
import { Bot, PhoneCall, MessageSquare, Mail, FileText } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/agenti")({
  head: () => ({
    meta: [
      { title: "Agenti AI | FMS AI Platform" },
      {
        name: "description",
        content: "Gestione degli agenti AI della piattaforma FMS: creazione, configurazione, stato.",
      },
      { property: "og:title", content: "Agenti AI | FMS AI Platform" },
      {
        property: "og:description",
        content: "Struttura per creare e configurare agenti AI su più canali.",
      },
    ],
  }),
  component: AgentiPage,
});

function AgentiPage() {
  return (
    <>
      <PageHeader
        title="Agenti AI"
        description="Spazio dedicato alla definizione degli agenti. Nessun agente è ancora implementato."
        actions={
          <Button disabled>
            <Bot className="size-4" />
            Nuovo agente
          </Button>
        }
      />
      <ModulePlaceholder
        blocks={[
          { title: "Agente telefonico", description: "Chiamate in entrata e uscita.", icon: PhoneCall },
          { title: "Agente WhatsApp", description: "Conversazioni su messaggistica.", icon: MessageSquare },
          { title: "Agente email", description: "Triage e risposte automatiche.", icon: Mail },
          { title: "Agente documenti", description: "Estrazione e analisi documentale.", icon: FileText },
        ]}
      />
    </>
  );
}
