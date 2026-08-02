import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/impostazioni")({
  head: () => ({
    meta: [
      { title: "Impostazioni | FMS AI Platform" },
      {
        name: "description",
        content: "Impostazioni account e workspace della piattaforma FMS AI.",
      },
      { property: "og:title", content: "Impostazioni | FMS AI Platform" },
      {
        property: "og:description",
        content: "Gestisci profilo, workspace e preferenze della piattaforma.",
      },
    ],
  }),
  component: ImpostazioniPage,
});

function ImpostazioniPage() {
  const { user } = Route.useRouteContext();

  return (
    <>
      <PageHeader title="Impostazioni" description="Profilo, workspace e preferenze della piattaforma." />

      <Tabs defaultValue="profilo">
        <TabsList>
          <TabsTrigger value="profilo">Profilo</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
        </TabsList>

        <TabsContent value="profilo" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account</CardTitle>
              <CardDescription>Dati dell'utente attualmente autenticato.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:max-w-md">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user.email ?? ""} readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="uid">ID utente</Label>
                <Input id="uid" value={user.id} readOnly className="font-mono text-xs" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workspace" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workspace</CardTitle>
              <CardDescription>
                Le preferenze del workspace saranno disponibili con i prossimi moduli.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-24 rounded-md border border-dashed border-border bg-muted/40" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
