import { createFileRoute } from "@tanstack/react-router";
import { PhoneCall, MessageSquare, Mail, FileText } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const Route = createFileRoute("/_authenticated/canali")({
  head: () => ({
    meta: [
      { title: "Canali | FMS AI Platform" },
      {
        name: "description",
        content: "Configurazione dei canali telefono, WhatsApp, email e documenti della piattaforma FMS AI.",
      },
      { property: "og:title", content: "Canali | FMS AI Platform" },
      {
        property: "og:description",
        content: "Collega e gestisci i canali di comunicazione della piattaforma.",
      },
    ],
  }),
  component: CanaliPage,
});

function CanaliPage() {
  return (
    <>
      <PageHeader
        title="Canali"
        description="Punti di contatto attraverso cui gli agenti opereranno."
      />
      <ModulePlaceholder
        blocks={[
          { title: "Telefono", description: "Numeri, instradamento e voce.", icon: PhoneCall, status: "Non collegato" },
          { title: "WhatsApp", description: "Numero business e template.", icon: MessageSquare, status: "Non collegato" },
          { title: "Email", description: "Caselle monitorate e firme.", icon: Mail, status: "Non collegato" },
          { title: "Documenti", description: "Fonti e cartelle da elaborare.", icon: FileText, status: "Non collegato" },
        ]}
      />
    </>
  );
}
