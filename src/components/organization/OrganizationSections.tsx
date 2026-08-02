import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { useOrganization } from "@/hooks/useOrganization";
import { updateOrganization } from "@/services/organizations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ORG_STATUS_LABELS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS, type OrgRole } from "@/types/platform";

export function OrganizationProfileSection() {
  const { activeMembership, can, refresh } = useOrganization();
  const org = activeMembership?.organization;
  const canEdit = can("org:update");

  const [name, setName] = useState(org?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(org?.logo_url ?? "");
  const [timezone, setTimezone] = useState(org?.timezone ?? "");
  const [locale, setLocale] = useState(org?.locale ?? "");

  const save = useMutation({
    mutationFn: () =>
      updateOrganization(org!.id, {
        name: name.trim(),
        logo_url: logoUrl.trim() || null,
        timezone: timezone.trim(),
        locale: locale.trim(),
      }),
    onSuccess: () => {
      toast.success("Organizzazione aggiornata");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!org) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Profilo organizzazione</CardTitle>
            <CardDescription>Dati generali dell'organizzazione attiva.</CardDescription>
          </div>
          <Badge variant="secondary">{ORG_STATUS_LABELS[org.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="org-name">Nome</Label>
          <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org-slug">Identificativo</Label>
          <Input id="org-slug" value={org.slug} readOnly className="font-mono text-xs" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org-logo">Logo (URL)</Label>
          <Input id="org-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={!canEdit} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="org-tz">Fuso orario</Label>
            <Input id="org-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-locale">Lingua</Label>
            <Input id="org-locale" value={locale} onChange={(e) => setLocale(e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        {canEdit ? (
          <div>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              Salva modifiche
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Solo proprietari e amministratori possono modificare queste impostazioni.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function RolesSection() {
  const { role } = useOrganization();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(Object.keys(ROLE_LABELS) as OrgRole[]).map((r) => (
        <Card key={r} className={r === role ? "border-primary/50" : undefined}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{ROLE_LABELS[r]}</CardTitle>
              {r === role ? <Badge variant="secondary">il tuo ruolo</Badge> : null}
            </div>
            <CardDescription>{ROLE_DESCRIPTIONS[r]}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {ROLE_PERMISSIONS[r].map((permission) => (
              <Badge key={permission} variant="outline" className="font-mono text-[10px]">
                {permission}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SecuritySection() {
  const { user, activeMembership } = useOrganization();
  const items = [
    {
      title: "Isolamento multi-tenant",
      description:
        "Ogni tabella contiene organization_id e le policy del database limitano l'accesso ai soli membri attivi dell'organizzazione.",
    },
    {
      title: "Permessi lato server",
      description:
        "I controlli di ruolo sono applicati dal database: l'interfaccia riflette i permessi, non li determina.",
    },
    {
      title: "Ruoli non auto-modificabili",
      description: "Nessun membro può modificare il proprio ruolo e l'ultimo proprietario non può essere rimosso.",
    },
    {
      title: "Registro append-only",
      description: "Gli eventi di audit non possono essere modificati né eliminati dagli utenti.",
    },
    {
      title: "Credenziali protette",
      description:
        "Le configurazioni di canali e tool non contengono segreti in chiaro: vengono salvati solo riferimenti a segreti gestiti lato server.",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <CardTitle className="text-base">{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessione corrente</CardTitle>
          <CardDescription>Riferimenti tecnici dell'accesso attuale.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:max-w-md">
          <div className="space-y-2">
            <Label htmlFor="sec-user">ID utente</Label>
            <Input id="sec-user" value={user.id} readOnly className="font-mono text-xs" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sec-org">ID organizzazione</Label>
            <Input
              id="sec-org"
              value={activeMembership?.organization_id ?? "—"}
              readOnly
              className="font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
