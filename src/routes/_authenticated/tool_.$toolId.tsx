import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Braces, CheckCircle2, History, Save, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
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
import { Textarea } from "@/components/ui/textarea";
import { useOrganization } from "@/hooks/useOrganization";
import { fetchTool, fetchToolExecutions, updateTool } from "@/services/entities";
import type { EntityStatus, ToolType } from "@/types/platform";
import { ENTITY_STATUS_LABELS, TOOL_TYPE_LABELS } from "@/types/platform";

type HttpConfig = {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  input_schema: Record<string, unknown>;
  headers: Record<string, string>;
  timeout_ms: number;
};

const defaultConfig: HttpConfig = {
  url: "",
  method: "POST",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
  headers: { "Content-Type": "application/json" },
  timeout_ms: 15000,
};

export const Route = createFileRoute("/_authenticated/tool_/$toolId")({
  head: () => ({ meta: [{ title: "Configura tool | FMS AI Platform" }] }),
  component: ToolEditorPage,
});

function ToolEditorPage() {
  const { toolId } = Route.useParams();
  const { organizationId, can } = useOrganization();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["tool", toolId], queryFn: () => fetchTool(toolId) });
  const executionsQuery = useQuery({
    queryKey: ["tool-executions", toolId],
    queryFn: () => fetchToolExecutions(toolId),
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [toolType, setToolType] = useState<ToolType>("api");
  const [status, setStatus] = useState<EntityStatus>("draft");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<HttpConfig["method"]>("POST");
  const [schema, setSchema] = useState(JSON.stringify(defaultConfig.input_schema, null, 2));
  const [headers, setHeaders] = useState(JSON.stringify(defaultConfig.headers, null, 2));
  const [timeoutMs, setTimeoutMs] = useState("15000");
  const [credentialsRef, setCredentialsRef] = useState("");

  useEffect(() => {
    const tool = query.data;
    if (!tool) return;
    const config = { ...defaultConfig, ...(tool.configuration as Partial<HttpConfig>) };
    setName(tool.name);
    setDescription(tool.description ?? "");
    setToolType(tool.tool_type);
    setStatus(tool.status);
    setUrl(config.url ?? "");
    setMethod(config.method ?? "POST");
    setSchema(JSON.stringify(config.input_schema ?? defaultConfig.input_schema, null, 2));
    setHeaders(JSON.stringify(config.headers ?? defaultConfig.headers, null, 2));
    setTimeoutMs(String(config.timeout_ms ?? 15000));
    setCredentialsRef(tool.credentials_ref ?? "");
  }, [query.data]);

  const supportsHttp = toolType === "api" || toolType === "webhook";
  const validation = useMemo(() => {
    try {
      const parsedSchema = JSON.parse(schema) as Record<string, unknown>;
      const parsedHeaders = JSON.parse(headers) as Record<string, string>;
      if (supportsHttp && !url.startsWith("https://")) return "L’endpoint deve usare HTTPS.";
      if (Number(timeoutMs) < 1000 || Number(timeoutMs) > 30000)
        return "Il timeout deve essere tra 1 e 30 secondi.";
      if (parsedSchema['type'] !== "object") return "Lo schema deve descrivere un oggetto JSON.";
      if (Object.keys(parsedHeaders).some((key) => /authorization|api-key|token|secret/i.test(key)))
        return "Non inserire credenziali negli header: usa il riferimento segreto.";
      return null;
    } catch {
      return "Schema e header devono essere JSON validi.";
    }
  }, [headers, schema, supportsHttp, timeoutMs, url]);

  const save = useMutation({
    mutationFn: () =>
      updateTool({
        toolId,
        organizationId: organizationId!,
        name,
        description,
        toolType,
        status,
        credentialsRef,
        configuration: supportsHttp
          ? {
              url,
              method,
              input_schema: JSON.parse(schema),
              headers: JSON.parse(headers),
              timeout_ms: Number(timeoutMs),
            }
          : { input_schema: JSON.parse(schema), timeout_ms: Number(timeoutMs) },
      }),
    onSuccess: async () => {
      toast.success("Tool salvato");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tool", toolId] }),
        queryClient.invalidateQueries({ queryKey: ["org-data", organizationId, "tools"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Caricamento tool…</p>;
  if (!query.data || query.data.organization_id !== organizationId)
    return <p className="text-sm text-destructive">Tool non trovato o non accessibile.</p>;
  const canWrite = can("resources:write");

  return (
    <>
      <PageHeader
        title={name || "Configura tool"}
        description="Definisci contratto, endpoint e limiti dello strumento usato dagli agenti."
        actions={
          <Button asChild variant="outline">
            <Link to="/tool">
              <ArrowLeft className="size-4" />
              Torna ai tool
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle>Configurazione</CardTitle>
            <CardDescription>I valori salvati qui non devono contenere segreti.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field label="Nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
            </Field>
            <Field label="Descrizione per il modello">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canWrite}
                placeholder="Spiega quando e perché l’agente deve usare questo tool."
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                <Select
                  value={toolType}
                  onValueChange={(v) => setToolType(v as ToolType)}
                  disabled={!canWrite}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TOOL_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Stato">
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as EntityStatus)}
                  disabled={!canWrite}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ENTITY_STATUS_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {supportsHttp && (
              <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
                <Field label="Metodo">
                  <Select
                    value={method}
                    onValueChange={(v) => setMethod(v as HttpConfig["method"])}
                    disabled={!canWrite}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["GET", "POST", "PUT", "PATCH", "DELETE"].map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Endpoint HTTPS">
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={!canWrite}
                    placeholder="https://api.example.com/action"
                  />
                </Field>
              </div>
            )}
            <Field label="Schema input (JSON Schema)">
              <Textarea
                className="min-h-56 font-mono text-xs"
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                disabled={!canWrite}
              />
            </Field>
            {supportsHttp && (
              <Field label="Header non sensibili (JSON)">
                <Textarea
                  className="min-h-28 font-mono text-xs"
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  disabled={!canWrite}
                />
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Timeout (ms)">
                <Input
                  type="number"
                  min={1000}
                  max={30000}
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(e.target.value)}
                  disabled={!canWrite}
                />
              </Field>
              <Field label="Riferimento segreto">
                <Input
                  value={credentialsRef}
                  onChange={(e) => setCredentialsRef(e.target.value)}
                  disabled={!canWrite}
                  placeholder="es. CRM_API_KEY"
                />
              </Field>
            </div>
            {validation && <p className="text-sm text-destructive">{validation}</p>}
            <Button
              onClick={() => save.mutate()}
              disabled={!canWrite || !name.trim() || Boolean(validation) || save.isPending}
            >
              <Save className="size-4" />
              Salva configurazione
            </Button>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4" />
                Sicurezza
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Le chiavi non vengono salvate nel database.</p>
              <p>Il riferimento segreto indica una variabile custodita nella Edge Function.</p>
              <p>Gli endpoint attivi devono usare HTTPS e rispettare timeout e schema.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Braces className="size-4" />
                Contratto del tool
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Lo schema JSON diventa la definizione che il modello usa per compilare gli argomenti.
              Il backend li valida prima dell’esecuzione.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" />
                Ultime esecuzioni
              </CardTitle>
              <CardDescription>Audit tecnico senza argomenti, risposte o segreti.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {executionsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Caricamento…</p>
              ) : executionsQuery.data?.length ? (
                executionsQuery.data.map((entry) => {
                  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
                  const succeeded = entry.action === "tool.execution.succeeded";
                  return (
                    <div key={entry.id} className="flex items-start gap-2 text-sm">
                      {succeeded ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      ) : (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                      )}
                      <div>
                        <p>{succeeded ? "Esecuzione riuscita" : "Esecuzione non riuscita"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString("it-IT")}
                          {typeof metadata['duration_ms'] === "number"
                            ? ` · ${metadata['duration_ms']} ms`
                            : ""}
                          {typeof metadata['http_status'] === "number"
                            ? ` · HTTP ${metadata['http_status']}`
                            : ""}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">Nessuna esecuzione registrata.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
