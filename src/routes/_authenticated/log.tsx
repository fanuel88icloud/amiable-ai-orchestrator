import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { formatDate } from "@/components/common/StatusBadge";
import { NoOrganizationState } from "@/components/organization/NoOrganizationState";
import { useOrganization } from "@/hooks/useOrganization";
import { fetchAuditLogs } from "@/services/entities";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/log")({
  head: () => ({
    meta: [
      { title: "Log | FMS AI Platform" },
      {
        name: "description",
        content: "Registro append-only delle attività dell'organizzazione attiva.",
      },
      { property: "og:title", content: "Log | FMS AI Platform" },
      {
        property: "og:description",
        content: "Tracciamento eventi e operazioni sensibili dell'organizzazione.",
      },
    ],
  }),
  component: LogPage,
});

function LogPage() {
  const { organizationId, can, isLoading: orgLoading } = useOrganization();

  const query = useQuery({
    queryKey: ["org-data", organizationId, "audit-logs"],
    queryFn: () => fetchAuditLogs(organizationId!),
    enabled: Boolean(organizationId) && can("audit:view"),
  });

  if (!orgLoading && !organizationId) {
    return (
      <>
        <PageHeader title="Log" description="Registro attività dell'organizzazione attiva." />
        <NoOrganizationState />
      </>
    );
  }

  if (!orgLoading && !can("audit:view")) {
    return (
      <>
        <PageHeader title="Log" description="Registro attività dell'organizzazione attiva." />
        <EmptyState
          icon={ScrollText}
          title="Accesso non consentito"
          description="Solo proprietari e amministratori possono consultare il registro attività."
        />
      </>
    );
  }

  const rows = query.data ?? [];

  return (
    <>
      <PageHeader
        title="Log"
        description="Registro append-only: gli eventi non possono essere modificati o eliminati."
      />
      {orgLoading || query.isLoading ? (
        <Card className="space-y-3 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Nessun evento registrato"
          description="Le operazioni sensibili eseguite nell'organizzazione compariranno qui."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Azione</TableHead>
                <TableHead>Risorsa</TableHead>
                <TableHead>Utente</TableHead>
                <TableHead className="text-right">Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.resource_type ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {log.user_id?.slice(0, 8) ?? "sistema"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDate(log.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
