import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { formatDate } from "@/components/common/StatusBadge";
import { useOrganization } from "@/hooks/useOrganization";
import { fetchMembers, inviteMember, removeMember, updateMemberRole } from "@/services/organizations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MEMBER_STATUS_LABELS,
  ROLE_LABELS,
  type OrgRole,
} from "@/types/platform";

const ROLE_OPTIONS = Object.entries(ROLE_LABELS) as [OrgRole, string][];

export function MembersSection() {
  const { organizationId, user, can } = useOrganization();
  const queryClient = useQueryClient();
  const canManage = can("members:manage");

  const query = useQuery({
    queryKey: ["org-data", organizationId, "members"],
    queryFn: () => fetchMembers(organizationId!),
    enabled: Boolean(organizationId),
  });

  const [inviteId, setInviteId] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("operator");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["org-data", organizationId, "members"] });

  const invite = useMutation({
    mutationFn: () =>
      inviteMember({
        organizationId: organizationId!,
        userId: inviteId.trim(),
        role: inviteRole,
        invitedBy: user.id,
      }),
    onSuccess: async () => {
      toast.success("Invito registrato");
      setInviteId("");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeRole = useMutation({
    mutationFn: (input: { id: string; role: OrgRole }) => updateMemberRole(input.id, input.role),
    onSuccess: async () => {
      toast.success("Ruolo aggiornato");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeMember(id),
    onSuccess: async () => {
      toast.success("Membro rimosso");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const members = query.data ?? [];

  return (
    <div className="space-y-4">
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invita un membro</CardTitle>
            <CardDescription>
              Inserisci l'identificativo dell'utente già registrato sulla piattaforma. Gli inviti via
              email saranno disponibili in un passaggio successivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1 space-y-2">
              <Label htmlFor="invite-id">ID utente</Label>
              <Input
                id="invite-id"
                value={inviteId}
                onChange={(e) => setInviteId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Ruolo</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as OrgRole)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.filter(([role]) => role !== "owner").map(([role, label]) => (
                    <SelectItem key={role} value={role}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!inviteId.trim() || invite.isPending} onClick={() => invite.mutate()}>
              Invita
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {query.isLoading ? (
        <Card className="space-y-3 p-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nessun membro"
          description="Invita le persone del tuo team per collaborare in questa organizzazione."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utente</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Aggiunto il</TableHead>
                {canManage ? <TableHead className="text-right">Azioni</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isSelf = member.user_id === user.id;
                return (
                  <TableRow key={member.id}>
                    <TableCell className="font-mono text-xs">
                      {member.user_id.slice(0, 8)}
                      {isSelf ? <Badge className="ml-2 text-[10px]">tu</Badge> : null}
                    </TableCell>
                    <TableCell>
                      {canManage && !isSelf ? (
                        <Select
                          value={member.role}
                          onValueChange={(v) =>
                            changeRole.mutate({ id: member.id, role: v as OrgRole })
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map(([role, label]) => (
                              <SelectItem key={role} value={role}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {MEMBER_STATUS_LABELS[member.status]}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(member.created_at)}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isSelf || remove.isPending}
                          onClick={() => remove.mutate(member.id)}
                        >
                          Rimuovi
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
