import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
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
        content: "Registro eventi ed esecuzioni degli agenti e dei workflow della piattaforma FMS AI.",
      },
      { property: "og:title", content: "Log | FMS AI Platform" },
      {
        property: "og:description",
        content: "Tracciamento di eventi, esecuzioni ed esiti sulla piattaforma.",
      },
    ],
  }),
  component: LogPage,
});

function LogPage() {
  return (
    <>
      <PageHeader
        title="Log"
        description="Registro delle esecuzioni. La raccolta dati verrà attivata con i primi agenti."
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Origine</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead className="text-right">Esito</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                  Nessun evento registrato.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
