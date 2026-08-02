import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";

import { useOrganization } from "@/hooks/useOrganization";
import { createOrganization, slugify } from "@/services/organizations";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/types/platform";

export function OrganizationSwitcher() {
  const { memberships, activeMembership, switchOrganization, isLoading } = useOrganization();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-[220px] justify-between gap-2">
            <Building2 className="size-4 shrink-0" />
            <span className="truncate">
              {isLoading
                ? "Caricamento…"
                : (activeMembership?.organization.name ?? "Nessuna organizzazione")}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Organizzazioni</DropdownMenuLabel>
          {memberships.length === 0 ? (
            <DropdownMenuItem disabled>Nessuna organizzazione</DropdownMenuItem>
          ) : (
            memberships.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onSelect={() => switchOrganization(m.organization_id)}
                className="gap-2"
              >
                <span className="truncate">{m.organization.name}</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {ROLE_LABELS[m.role]}
                </Badge>
                {m.organization_id === activeMembership?.organization_id ? (
                  <Check className="size-3.5" />
                ) : null}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Nuova organizzazione
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrganizationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, refresh, switchOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const mutation = useMutation({
    mutationFn: () => createOrganization({ name, slug, userId: user.id }),
    onSuccess: async (org) => {
      toast.success("Organizzazione creata");
      setName("");
      setSlug("");
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["memberships", user.id] });
      switchOrganization(org.id);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuova organizzazione</DialogTitle>
          <DialogDescription>
            Ogni organizzazione ha dati, membri e configurazioni completamente separati.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Nome</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(slugify(e.target.value));
              }}
              placeholder="Nome azienda"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Identificativo</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder="nome-azienda"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            Crea organizzazione
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
