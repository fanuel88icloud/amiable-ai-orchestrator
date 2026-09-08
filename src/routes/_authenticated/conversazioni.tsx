import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  CircleUserRound,
  Inbox,
  MessageSquare,
  Paperclip,
  Radio,
  Send,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { NoOrganizationState } from "@/components/organization/NoOrganizationState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganization } from "@/hooks/useOrganization";
import {
  conversationAction,
  fetchConversationMessages,
  fetchConversations,
  fetchInboxMembers,
  type Conversation,
} from "@/services/conversations";
import { CHANNEL_TYPE_LABELS } from "@/types/platform";

type Filter = "all" | "open" | "handoff" | "mine" | "closed";

export const Route = createFileRoute("/_authenticated/conversazioni")({
  head: () => ({ meta: [{ title: "Conversazioni | FMS AI Platform" }] }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const { organizationId, user, role, isLoading: orgLoading } = useOrganization();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const conversationsQuery = useQuery({
    queryKey: ["conversations", organizationId],
    queryFn: () => fetchConversations(organizationId!),
    enabled: Boolean(organizationId),
    refetchInterval: 5000,
  });
  const membersQuery = useQuery({
    queryKey: ["inbox-members", organizationId],
    queryFn: () => fetchInboxMembers(organizationId!),
    enabled: Boolean(organizationId),
  });
  const messagesQuery = useQuery({
    queryKey: ["conversation-messages", selectedId],
    queryFn: () => fetchConversationMessages(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: 3000,
  });

  const filtered = useMemo(() => {
    const rows = conversationsQuery.data ?? [];
    if (filter === "all") return rows.filter((row) => row.status !== "closed");
    if (filter === "mine")
      return rows.filter((row) => row.assigned_to === user.id && row.status !== "closed");
    return rows.filter((row) => row.status === filter);
  }, [conversationsQuery.data, filter, user.id]);

  useEffect(() => {
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].id);
    if (selectedId && !filtered.some((row) => row.id === selectedId))
      setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);

  const selected = (conversationsQuery.data ?? []).find((row) => row.id === selectedId) ?? null;
  const canManage = role !== "viewer";
  const actionMutation = useMutation({
    mutationFn: (input: Parameters<typeof conversationAction>[0]) => conversationAction(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["conversations", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["conversation-messages", selectedId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function runAction(
    patch: Omit<Parameters<typeof conversationAction>[0], "organizationId" | "conversationId">,
  ) {
    if (!organizationId || !selectedId) return;
    actionMutation.mutate({ organizationId, conversationId: selectedId, ...patch });
  }

  function selectConversation(conversation: Conversation) {
    setSelectedId(conversation.id);
    if (conversation.unread_count > 0 && organizationId) {
      void conversationAction({
        organizationId,
        conversationId: conversation.id,
        action: "read",
      }).then(() => queryClient.invalidateQueries({ queryKey: ["conversations", organizationId] }));
    }
  }

  if (!orgLoading && !organizationId) {
    return (
      <>
        <PageHeader title="Conversazioni" description="Inbox dell’organizzazione attiva." />
        <NoOrganizationState />
      </>
    );
  }

  const filters: Array<{ value: Filter; label: string }> = [
    { value: "all", label: "Aperte" },
    { value: "handoff", label: "Da gestire" },
    { value: "mine", label: "Assegnate a me" },
    { value: "closed", label: "Chiuse" },
  ];

  return (
    <>
      <PageHeader title="Conversazioni" description="Inbox unificata per AI e operatori umani." />
      <Card className="overflow-hidden p-0">
        <div className="flex min-h-[680px] flex-col lg:grid lg:grid-cols-[320px_minmax(420px,1fr)_280px]">
          <section className="border-b lg:border-r lg:border-b-0">
            <div className="space-y-3 border-b p-4">
              <div className="flex items-center gap-2 font-semibold">
                <Inbox className="size-4" />
                Inbox
              </div>
              <div className="flex flex-wrap gap-1">
                {filters.map((item) => (
                  <Button
                    key={item.value}
                    size="sm"
                    variant={filter === item.value ? "secondary" : "ghost"}
                    onClick={() => setFilter(item.value)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
            <ScrollArea className="h-[590px]">
              {filtered.length ? (
                filtered.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => selectConversation(conversation)}
                    className={`w-full border-b p-4 text-left transition-colors hover:bg-muted/50 ${selectedId === conversation.id ? "bg-muted" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium">
                        {conversation.contact_name ||
                          conversation.subject ||
                          `Sessione ${conversation.external_session_id.slice(0, 8)}`}
                      </p>
                      {conversation.unread_count > 0 && <Badge>{conversation.unread_count}</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {conversation.last_message_preview || "Nessun messaggio"}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{conversation.channel?.name ?? "Canale"}</span>
                      <span>
                        {shortDate(conversation.last_message_at ?? conversation.updated_at)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nessuna conversazione in questa vista.
                </div>
              )}
            </ScrollArea>
          </section>

          <section className="flex min-h-[680px] flex-col border-b lg:border-r lg:border-b-0">
            {selected ? (
              <>
                <div className="flex items-center justify-between gap-3 border-b p-4">
                  <div>
                    <h2 className="font-semibold">
                      {selected.contact_name || selected.subject || "Conversazione"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {selected.channel?.name} ·{" "}
                      {selected.channel
                        ? CHANNEL_TYPE_LABELS[selected.channel.channel_type]
                        : "Canale"}
                    </p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4 pr-4">
                    {messagesQuery.data?.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-2 ${message.role === "user" ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm ${message.role === "user" ? "bg-muted" : message.role === "operator" ? "bg-primary text-primary-foreground" : "bg-primary/10"}`}
                        >
                          <div className="mb-1 flex items-center gap-1 text-[11px] opacity-70">
                            {message.role === "user" ? (
                              <CircleUserRound className="size-3" />
                            ) : message.role === "operator" ? (
                              <UserRoundCheck className="size-3" />
                            ) : (
                              <Bot className="size-3" />
                            )}
                            {message.role === "user"
                              ? "Contatto"
                              : message.role === "operator"
                                ? "Operatore"
                                : "Agente AI"}
                          </div>
                          <p className="whitespace-pre-wrap">{message.content}</p>
                          {message.attachments.length > 0 && (
                            <div className="mt-3 space-y-1 border-t border-current/10 pt-2">
                              {message.attachments.map((attachment) => (
                                <a
                                  key={attachment.id}
                                  href={attachment.download_url ?? undefined}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-xs underline-offset-2 hover:underline"
                                  aria-disabled={!attachment.download_url}
                                >
                                  <Paperclip className="size-3" />
                                  {attachment.kind === "original_eml" ? "Originale PEC: " : ""}
                                  {attachment.filename}
                                </a>
                              ))}
                            </div>
                          )}
                          <p className="mt-1 text-[10px] opacity-60">
                            {messageTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <form
                  className="flex gap-2 border-t p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!reply.trim()) return;
                    runAction({ action: "reply", message: reply.trim() });
                    setReply("");
                  }}
                >
                  <Input
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder={
                      selected.status === "closed"
                        ? "Conversazione chiusa"
                        : "Rispondi come operatore…"
                    }
                    disabled={
                      !canManage || selected.status === "closed" || actionMutation.isPending
                    }
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={
                      !canManage ||
                      !reply.trim() ||
                      selected.status === "closed" ||
                      actionMutation.isPending
                    }
                  >
                    <Send className="size-4" />
                  </Button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                <MessageSquare className="mr-2 size-4" />
                Seleziona una conversazione
              </div>
            )}
          </section>

          <aside className="space-y-5 p-4">
            {selected && (
              <>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Assegnazione
                  </p>
                  <Select
                    value={selected.assigned_to ?? "none"}
                    onValueChange={(value) =>
                      runAction({ action: "assign", assignedTo: value === "none" ? null : value })
                    }
                    disabled={!canManage}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Non assegnata</SelectItem>
                      {(membersQuery.data ?? []).map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.profile?.full_name ||
                            (member.user_id === user.id ? "Io" : member.user_id.slice(0, 8))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Azioni
                  </p>
                  {selected.status !== "handoff" && (
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      disabled={!canManage}
                      onClick={() => runAction({ action: "status", status: "handoff" })}
                    >
                      <Radio className="size-4" />
                      Prendi in carico
                    </Button>
                  )}
                  {selected.status === "closed" ? (
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      disabled={!canManage}
                      onClick={() => runAction({ action: "status", status: "open" })}
                    >
                      <MessageSquare className="size-4" />
                      Riapri
                    </Button>
                  ) : (
                    <Button
                      className="w-full justify-start"
                      variant="outline"
                      disabled={!canManage}
                      onClick={() => runAction({ action: "status", status: "closed" })}
                    >
                      <CheckCircle2 className="size-4" />
                      Chiudi
                    </Button>
                  )}
                </div>
                <div className="space-y-3 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Dettagli
                  </p>
                  <Detail
                    label="Contatto"
                    value={selected.contact_address || selected.external_session_id}
                  />
                  <Detail label="Canale" value={selected.channel?.name ?? "—"} />
                  <Detail
                    label="Creata"
                    value={new Date(selected.created_at).toLocaleString("it-IT")}
                  />
                  {selected.handoff_reason && (
                    <Detail label="Motivo passaggio" value={selected.handoff_reason} />
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </Card>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    open: "AI attivo",
    handoff: "Operatore",
    closed: "Chiusa",
  };
  return (
    <Badge variant={status === "handoff" ? "default" : "secondary"}>
      {labels[status] ?? status}
    </Badge>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words">{value}</p>
    </div>
  );
}
function shortDate(value: string) {
  return new Date(value).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}
function messageTime(value: string) {
  return new Date(value).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
