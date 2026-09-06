import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, History, Save, Send } from "lucide-react";
import { toast } from "sonner";

import {
  AGENT_LANGUAGES,
  AGENT_TYPES,
  EMPTY_SECTIONS,
  INSTRUCTION_FIELDS,
  buildSystemInstructions,
  parseSections,
  type InstructionSections,
} from "@/config/agents";
import {
  fetchAgent,
  fetchAgentVersions,
  fetchAiModels,
  publishAgent,
  updateAgent,
} from "@/services/agents";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AgentTestConsole } from "@/components/agents/AgentTestConsole";
import { AgentToolsPanel } from "@/components/agents/AgentToolsPanel";
import type { Agent } from "@/types/platform";

export const Route = createFileRoute("/_authenticated/agenti_/$agentId")({
  component: AgentEditorPage,
});

type Draft = {
  name: string;
  description: string;
  agentType: string;
  language: string;
  modelName: string;
  fallbackMessage: string;
  handoffEnabled: boolean;
  sections: InstructionSections;
};

function toDraft(agent: Agent): Draft {
  return {
    name: agent.name,
    description: agent.description ?? "",
    agentType: agent.agent_type,
    language: agent.language,
    modelName: agent.model_name ?? "",
    fallbackMessage: agent.fallback_message ?? "",
    handoffEnabled: agent.handoff_enabled,
    sections: parseSections(agent.instruction_sections),
  };
}

function AgentEditorPage() {
  const { agentId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organizationId, user, can } = useOrganization();
  const [draft, setDraft] = useState<Draft | null>(null);

  const agentQuery = useQuery({ queryKey: ["agent", agentId], queryFn: () => fetchAgent(agentId) });
  const modelsQuery = useQuery({ queryKey: ["ai-models"], queryFn: fetchAiModels });
  const versionsQuery = useQuery({
    queryKey: ["agent-versions", agentId],
    queryFn: () => fetchAgentVersions(agentId),
  });

  useEffect(() => {
    if (agentQuery.data) setDraft(toDraft(agentQuery.data));
  }, [agentQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const model = modelsQuery.data?.find((item) => item.model_name === draft.modelName);
      await updateAgent(agentId, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        agent_type: draft.agentType,
        language: draft.language,
        model_name: draft.modelName,
        model_provider: model?.provider ?? "openai",
        fallback_message: draft.fallbackMessage.trim() || null,
        handoff_enabled: draft.handoffEnabled,
        instruction_sections: draft.sections,
        system_instructions: buildSystemInstructions(draft.sections, draft.fallbackMessage),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent", agentId] }),
        queryClient.invalidateQueries({ queryKey: ["org-data", organizationId, "agents"] }),
      ]);
      toast.success("Bozza salvata");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      await saveMutation.mutateAsync();
      return publishAgent(agentId);
    },
    onSuccess: async (version) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent", agentId] }),
        queryClient.invalidateQueries({ queryKey: ["agent-versions", agentId] }),
        queryClient.invalidateQueries({ queryKey: ["org-data", organizationId, "agents"] }),
      ]);
      toast.success(`Versione ${version.version_number} pubblicata`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (agentQuery.isLoading || !draft) return <Card className="h-72 animate-pulse" />;
  if (agentQuery.isError || agentQuery.data?.organization_id !== organizationId) {
    return <Card className="p-6">Agente non trovato o non accessibile.</Card>;
  }

  const canWrite = can("resources:write");
  const busy = saveMutation.isPending || publishMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/agenti" })}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">{draft.name}</h1>
          <p className="text-sm text-muted-foreground">
            Versione {agentQuery.data.version} ·{" "}
            {agentQuery.data.status === "draft" ? "Bozza" : "Pubblicato"}
          </p>
        </div>
        {canWrite && (
          <Button variant="outline" disabled={busy} onClick={() => saveMutation.mutate()}>
            <Save className="size-4" /> Salva bozza
          </Button>
        )}
        {canWrite && (
          <Button
            disabled={busy || !draft.name.trim() || !draft.modelName}
            onClick={() => publishMutation.mutate()}
          >
            <Send className="size-4" /> Pubblica
          </Button>
        )}
      </div>

      <Tabs defaultValue="identity">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-6">
          <TabsTrigger value="identity">Identità</TabsTrigger>
          <TabsTrigger value="instructions">Istruzioni</TabsTrigger>
          <TabsTrigger value="behavior">Modello</TabsTrigger>
          <TabsTrigger value="tools">Tool</TabsTrigger>
          <TabsTrigger value="test">Test</TabsTrigger>
          <TabsTrigger value="versions">Versioni</TabsTrigger>
        </TabsList>

        <TabsContent value="identity">
          <Card>
            <CardHeader>
              <CardTitle>Identità dell’agente</CardTitle>
              <CardDescription>
                Come viene riconosciuto e classificato nella piattaforma.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Nome">
                <Input
                  disabled={!canWrite}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="Tipo">
                <Select
                  disabled={!canWrite}
                  value={draft.agentType}
                  onValueChange={(agentType) => setDraft({ ...draft, agentType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_TYPES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Descrizione">
                  <Textarea
                    disabled={!canWrite}
                    rows={4}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Lingua">
                <Select
                  disabled={!canWrite}
                  value={draft.language}
                  onValueChange={(language) => setDraft({ ...draft, language })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_LANGUAGES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="instructions">
          <Card>
            <CardHeader>
              <CardTitle>Istruzioni operative</CardTitle>
              <CardDescription>
                Regole separate e leggibili che formano automaticamente il prompt di sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              {INSTRUCTION_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <Textarea
                    disabled={!canWrite}
                    rows={4}
                    value={draft.sections[field.key]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        sections: { ...draft.sections, [field.key]: e.target.value },
                      })
                    }
                  />
                </Field>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="behavior">
          <Card>
            <CardHeader>
              <CardTitle>Modello e comportamento</CardTitle>
              <CardDescription>
                Il catalogo modelli arriva dal database e non contiene credenziali.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Modello AI">
                <Select
                  disabled={!canWrite || modelsQuery.isLoading}
                  value={draft.modelName}
                  onValueChange={(modelName) => setDraft({ ...draft, modelName })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona un modello" />
                  </SelectTrigger>
                  <SelectContent>
                    {(modelsQuery.data ?? []).map((model) => (
                      <SelectItem key={model.id} value={model.model_name}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label>Passaggio a operatore</Label>
                  <p className="text-sm text-muted-foreground">
                    Consenti l’escalation verso una persona.
                  </p>
                </div>
                <Switch
                  disabled={!canWrite}
                  checked={draft.handoffEnabled}
                  onCheckedChange={(handoffEnabled) => setDraft({ ...draft, handoffEnabled })}
                />
              </div>
              <div className="sm:col-span-2">
                <Field label="Messaggio quando non conosce la risposta">
                  <Textarea
                    disabled={!canWrite}
                    rows={3}
                    value={draft.fallbackMessage}
                    onChange={(e) => setDraft({ ...draft, fallbackMessage: e.target.value })}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools">
          <AgentToolsPanel agentId={agentId} organizationId={organizationId!} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="test">
          <AgentTestConsole
            agentId={agentId}
            organizationId={organizationId!}
            userId={user.id}
            versions={versionsQuery.data ?? []}
            onSaveDraft={async () => {
              await saveMutation.mutateAsync();
            }}
          />
        </TabsContent>

        <TabsContent value="versions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="size-5" /> Cronologia pubblicazioni
              </CardTitle>
              <CardDescription>Ogni versione pubblicata è immutabile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {versionsQuery.data?.length ? (
                versionsQuery.data.map((version) => (
                  <div key={version.id} className="flex items-center gap-3 rounded-lg border p-4">
                    <div className="rounded-full bg-primary/10 p-2 text-primary">
                      <Check className="size-4" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Versione {version.version_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(version.created_at).toLocaleString("it-IT")}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">{version.model_name}</span>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  Nessuna versione pubblicata.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
