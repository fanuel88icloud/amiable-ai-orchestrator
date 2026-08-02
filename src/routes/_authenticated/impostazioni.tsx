import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { formatDate } from "@/components/common/StatusBadge";
import { NoOrganizationState } from "@/components/organization/NoOrganizationState";
import { MembersSection } from "@/components/organization/MembersSection";
import {
  OrganizationProfileSection,
  RolesSection,
  SecuritySection,
} from "@/components/organization/OrganizationSections";
import { useOrganization } from "@/hooks/useOrganization";
import { fetchAuditLogs } from "@/services/entities";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/impostazioni")({
  head: () => ({
    meta: [
      { title: "Impostazioni | FMS AI Platform" },
      {
        name: "description",
        content: "Profilo organizzazione, membri, ruoli e permessi, sicurezza e registro attività.",
      },
      { property: "og:title", content: "Impostazioni | FMS AI Platform" },
      {
        property: "og:description",
        content: "Gestisci organizzazione, membri, ruoli, sicurezza e audit log.",
      },
    ],
  }),
  component: ImpostazioniPage,
});

function ImpostazioniPage() {
  const { organizationId, isLoading } = useOrganization();

  if (!isLoading && !organizationId) {
    return (
      <>
        <PageHeader title="Impostazioni" description="Configurazione dell'organizzazione attiva." />
        <NoOrganizationState />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Impostazioni"
        description="Profilo organizzazione, membri, ruoli, sicurezza e registro attività."
      />
      <Tabs defaultValue="profilo">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profilo">Profilo organizzazione</TabsTrigger>
          <TabsTrigger value="membri">Membri</TabsTrigger>
          <TabsTrigger value="ruoli">Ruoli e permessi</TabsTrigger>
          <TabsTrigger value="sicurezza">Sicurezza</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="profilo" className="mt-4">
          <OrganizationProfileSection />
        </TabsContent>
        <TabsContent value="membri" className="mt-4">
          <MembersSection />
        </TabsContent>
        <TabsContent value="ruoli" className="mt-4">
          <RolesSection />
        </TabsContent>
        <TabsContent value="sicurezza" className="mt-4">
          <SecuritySection />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditSection />
        </TabsContent>
      </Tabs>
    </>
  );
}

function AuditSection() {
  const { organizationId, can } = useOrganization();
  const query = useQuery({
    queryKey: ["org-data", organizationId, "audit-logs"],
    queryFn: () => fetchAuditLogs(organizationId!, 50),
    enabled: Boolean(organizationId) && can("audit:view"),
  });

  if (!can("audit:view")) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Accesso non consentito"
        description="Solo proprietari e amministratori possono consultare il registro attività."
      />
    );
  }

  const rows = query.data ?? [];
  if (!query.isLoading && rows.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Nessun evento registrato"
        description="Il registro è append-only: gli eventi non sono modificabili né eliminabili."
      />
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Azione</TableHead>
            <TableHead>Risorsa</TableHead>
            <TableHead className="text-right">Data</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.action}</TableCell>
              <TableCell className="text-muted-foreground">{log.resource_type ?? "—"}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatDate(log.created_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
