import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Clock3, Coins, MessageSquarePlus, Send, User } from "lucide-react";
import { toast } from "sonner";

import {
  createTestSession,
  fetchTestMessages,
  fetchTestRuns,
  sendAgentTestMessage,
} from "@/services/agents";
import type { AgentVersion, TestSession } from "@/types/platform";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  agentId: string;
  organizationId: string;
  userId: string;
  versions: AgentVersion[];
  onSaveDraft: () => Promise<void>;
};

export function AgentTestConsole({
  agentId,
  organizationId,
  userId,
  versions,
  onSaveDraft,
}: Props) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<TestSession | null>(null);
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("draft");
  const messagesQuery = useQuery({
    queryKey: ["test-messages", session?.id],
    queryFn: () => fetchTestMessages(session!.id),
    enabled: Boolean(session),
  });
  const runsQuery = useQuery({
    queryKey: ["test-runs", agentId],
    queryFn: () => fetchTestRuns(agentId, 10),
  });

  async function newSession() {
    if (target === "draft") await onSaveDraft();
    const agentVersionId = target === "draft" ? null : target;
    const created = await createTestSession({ organizationId, agentId, agentVersionId, userId });
    setSession(created);
    await queryClient.invalidateQueries({ queryKey: ["test-messages"] });
  }

  const sendMutation = useMutation({
    mutationFn: async () => {
      let activeSession = session;
      if (!activeSession) {
        if (target === "draft") await onSaveDraft();
        activeSession = await createTestSession({
          organizationId,
          agentId,
          agentVersionId: target === "draft" ? null : target,
          userId,
        });
        setSession(activeSession);
      }
      return sendAgentTestMessage({ sessionId: activeSession.id, message: message.trim() });
    },
    onSuccess: async () => {
      setMessage("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["test-messages"] }),
        queryClient.invalidateQueries({ queryKey: ["test-runs", agentId] }),
        queryClient.invalidateQueries({ queryKey: ["agent", agentId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const lastRun = runsQuery.data?.[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <Card className="flex min-h-[560px] flex-col">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Simulatore testuale</CardTitle>
              <CardDescription>
                Prova il comportamento prima di collegare canali reali.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select
                value={target}
                onValueChange={(value) => {
                  setTarget(value);
                  setSession(null);
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Bozza corrente</SelectItem>
                  {versions.map((version) => (
                    <SelectItem key={version.id} value={version.id}>
                      Versione {version.version_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                title="Nuova sessione"
                onClick={() => void newSession()}
              >
                <MessageSquarePlus className="size-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 p-4">
          <div className="flex-1 space-y-4 overflow-y-auto rounded-lg bg-muted/30 p-4">
            {messagesQuery.data?.length ? (
              messagesQuery.data.map((item) => (
                <div
                  key={item.id}
                  className={`flex gap-3 ${item.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {item.role !== "user" && (
                    <div className="rounded-full bg-primary/10 p-2 text-primary">
                      <Bot className="size-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${item.role === "user" ? "bg-primary text-primary-foreground" : "bg-background shadow-sm"}`}
                  >
                    {item.content}
                  </div>
                  {item.role === "user" && (
                    <div className="rounded-full bg-muted p-2">
                      <User className="size-4" />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="flex h-full min-h-80 items-center justify-center text-center text-sm text-muted-foreground">
                Scrivi un messaggio per iniziare il test dell’agente.
              </div>
            )}
            {sendMutation.isPending && (
              <div className="text-sm text-muted-foreground">L’agente sta rispondendo…</div>
            )}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (message.trim()) sendMutation.mutate();
            }}
          >
            <Input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Scrivi un messaggio di prova…"
              disabled={sendMutation.isPending}
            />
            <Button type="submit" size="icon" disabled={!message.trim() || sendMutation.isPending}>
              <Send className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ultima esecuzione</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {lastRun ? (
            <>
              <Metric
                icon={Clock3}
                label="Durata"
                value={lastRun.duration_ms ? `${lastRun.duration_ms} ms` : "—"}
              />
              <Metric
                icon={MessageSquarePlus}
                label="Token"
                value={`${lastRun.input_tokens ?? 0} in / ${lastRun.output_tokens ?? 0} out`}
              />
              <Metric
                icon={Coins}
                label="Costo stimato"
                value={
                  lastRun.estimated_cost != null
                    ? `${Number(lastRun.estimated_cost).toFixed(6)} ${lastRun.currency ?? "EUR"}`
                    : "—"
                }
              />
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Modello</p>
                <p className="mt-1 break-all font-medium">{lastRun.model_name}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Esito</p>
                <p className="mt-1 font-medium">
                  {lastRun.status === "success" ? "Completato" : "Errore"}
                </p>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Le metriche appariranno dopo il primo messaggio.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-4 text-muted-foreground" />
      <div>
        <p className="text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}
