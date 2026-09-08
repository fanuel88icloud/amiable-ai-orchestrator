import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  KeyRound,
  Mail,
  MessageCircle,
  Plug,
  RefreshCw,
  Save,
  Send,
  Server,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { formatDate } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
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
import {
  configureImapConnection,
  disconnectEmailConnection,
  fetchEmailConnection,
  startEmailOAuth,
  syncEmailConnection,
  type EmailProvider,
} from "@/services/emailConnections";
import {
  fetchAgents,
  fetchChannel,
  rotateChannelApiKey,
  sendChannelMessage,
  updateChannel,
} from "@/services/entities";
import type { ChannelType, EntityStatus } from "@/types/platform";
import { CHANNEL_TYPE_LABELS, ENTITY_STATUS_LABELS } from "@/types/platform";

type ChannelConfig = {
  welcome_message?: string;
  placeholder?: string;
  allowed_origins?: string[];
  max_requests_per_minute?: number;
  email_from_name?: string;
  email_from_address?: string;
  email_inbound_address?: string;
  email_reply_mode?: "operator" | "automatic";
  email_signature?: string;
  webhook_secret_ref?: string;
};

export const Route = createFileRoute("/_authenticated/canali_/$channelId")({
  head: () => ({ meta: [{ title: "Configura canale | FMS AI Platform" }] }),
  component: ChannelEditorPage,
});

function ChannelEditorPage() {
  const { channelId } = Route.useParams();
  const { organizationId, can } = useOrganization();
  const queryClient = useQueryClient();
  const channelQuery = useQuery({
    queryKey: ["channel", channelId],
    queryFn: () => fetchChannel(channelId),
  });
  const agentsQuery = useQuery({
    queryKey: ["org-data", organizationId, "agents"],
    queryFn: () => fetchAgents(organizationId!),
    enabled: Boolean(organizationId),
  });
  const emailConnectionQuery = useQuery({
    queryKey: ["email-connection", organizationId, channelId],
    queryFn: () => fetchEmailConnection(organizationId!, channelId),
    enabled: Boolean(organizationId) && channelType === "email",
  });
  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState<ChannelType>("webchat");
  const [status, setStatus] = useState<EntityStatus>("draft");
  const [agentId, setAgentId] = useState("none");
  const [welcome, setWelcome] = useState("Ciao! Come posso aiutarti?");
  const [placeholder, setPlaceholder] = useState("Scrivi un messaggio…");
  const [origins, setOrigins] = useState("");
  const [rateLimit, setRateLimit] = useState("10");
  const [emailFromName, setEmailFromName] = useState("");
  const [emailFromAddress, setEmailFromAddress] = useState("");
  const [emailInboundAddress, setEmailInboundAddress] = useState("");
  const [emailReplyMode, setEmailReplyMode] = useState<"operator" | "automatic">("operator");
  const [emailSignature, setEmailSignature] = useState("");
  const [credentialsRef, setCredentialsRef] = useState("RESEND_API_KEY");
  const [webhookSecretRef, setWebhookSecretRef] = useState("RESEND_WEBHOOK_SECRET");
  const [emailProvider, setEmailProvider] = useState<EmailProvider>("microsoft");
  const [imapPassword, setImapPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [imapSecurity, setImapSecurity] = useState<"tls" | "starttls">("tls");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpSecurity, setSmtpSecurity] = useState<"tls" | "starttls">("tls");
  const [apiKey, setApiKey] = useState("");
  const [testInput, setTestInput] = useState("");
  const [testMessages, setTestMessages] = useState<
    Array<{ role: "user" | "assistant"; text: string }>
  >([]);
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    const channel = channelQuery.data;
    if (!channel) return;
    const config = (channel.configuration ?? {}) as ChannelConfig;
    setName(channel.name);
    setChannelType(channel.channel_type);
    setStatus(channel.status);
    setAgentId(channel.agent_id ?? "none");
    setWelcome(config.welcome_message ?? "Ciao! Come posso aiutarti?");
    setPlaceholder(config.placeholder ?? "Scrivi un messaggio…");
    setOrigins((config.allowed_origins ?? []).join("\n"));
    setRateLimit(String(config.max_requests_per_minute ?? 10));
    setEmailFromName(config.email_from_name ?? "");
    setEmailFromAddress(config.email_from_address ?? "");
    setEmailInboundAddress(config.email_inbound_address ?? "");
    setEmailReplyMode(config.email_reply_mode ?? "operator");
    setEmailSignature(config.email_signature ?? "");
    setCredentialsRef(channel.credentials_ref ?? "RESEND_API_KEY");
    setWebhookSecretRef(config.webhook_secret_ref ?? "RESEND_WEBHOOK_SECRET");
    setEmailProvider((channel.provider as EmailProvider | null) ?? "microsoft");
  }, [channelQuery.data]);

  useEffect(() => {
    const connection = emailConnectionQuery.data;
    if (!connection) return;
    setEmailProvider(connection.provider);
    setEmailFromAddress(connection.email_address ?? "");
    setEmailInboundAddress(connection.email_address ?? "");
    setEmailFromName(connection.display_name ?? "");
    const config = connection.configuration;
    if (connection.provider === "imap") {
      setImapHost(String(config.imap_host ?? ""));
      setImapPort(String(config.imap_port ?? 993));
      setImapSecurity(config.imap_security === "starttls" ? "starttls" : "tls");
      setSmtpHost(String(config.smtp_host ?? ""));
      setSmtpPort(String(config.smtp_port ?? 465));
      setSmtpSecurity(config.smtp_security === "starttls" ? "starttls" : "tls");
    }
  }, [emailConnectionQuery.data]);

  const publishedAgents = (agentsQuery.data ?? []).filter((agent) => agent.published_at);
  const validation = useMemo(() => {
    if (!name.trim()) return "Inserisci il nome del canale.";
    if (!["webchat", "api", "email"].includes(channelType))
      return "Questo tipo di canale non è ancora attivabile.";
    if (status === "active" && agentId === "none")
      return "Associa un agente pubblicato prima di attivare il canale.";
    if (status === "active" && channelType === "api" && !channelQuery.data?.api_key_rotated_at)
      return "Genera la chiave API prima di attivare il canale.";
    if (status === "active" && channelType === "email") {
      if (!/^\S+@\S+\.\S+$/.test(emailFromAddress.trim()))
        return "Inserisci un indirizzo mittente email valido.";
      if (!/^\S+@\S+\.\S+$/.test(emailInboundAddress.trim()))
        return "Inserisci un indirizzo email di ricezione valido.";
      if (emailProvider === "resend") {
        if (!/^[A-Z][A-Z0-9_]+$/.test(credentialsRef.trim()))
          return "Il riferimento al segreto Resend non è valido.";
        if (!/^[A-Z][A-Z0-9_]+$/.test(webhookSecretRef.trim()))
          return "Il riferimento al segreto webhook non è valido.";
      } else if (emailConnectionQuery.data?.status !== "connected") {
        return "Completa e verifica il collegamento della casella prima di attivare il canale.";
      } else if (emailConnectionQuery.data.configuration.runtime_ready !== true) {
        return "Il collegamento è autorizzato; completa il runtime di sincronizzazione prima di attivarlo.";
      }
    }
    const limit = Number(rateLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 60)
      return "Il limite deve essere tra 1 e 60 richieste al minuto.";
    const invalidOrigin = origins
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean)
      .find((value) => {
        try {
          return new URL(value).origin !== value;
        } catch {
          return true;
        }
      });
    if (status === "active" && channelType === "webchat" && !origins.trim())
      return "Inserisci almeno una origine autorizzata prima di attivare la webchat.";
    return invalidOrigin ? `Origine non valida: ${invalidOrigin}` : null;
  }, [
    agentId,
    channelQuery.data?.api_key_rotated_at,
    channelType,
    credentialsRef,
    emailFromAddress,
    emailInboundAddress,
    emailConnectionQuery.data?.status,
    emailConnectionQuery.data?.configuration.runtime_ready,
    emailProvider,
    name,
    origins,
    rateLimit,
    status,
    webhookSecretRef,
  ]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateChannel({
        channelId,
        organizationId: organizationId!,
        name,
        channelType,
        status,
        agentId: agentId === "none" ? null : agentId,
        configuration: {
          welcome_message: welcome.trim(),
          placeholder: placeholder.trim(),
          allowed_origins: origins
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          max_requests_per_minute: Number(rateLimit),
          email_from_name: emailFromName.trim(),
          email_from_address: emailFromAddress.trim().toLowerCase(),
          email_inbound_address: emailInboundAddress.trim().toLowerCase(),
          email_reply_mode: emailReplyMode,
          email_signature: emailSignature.trim(),
          webhook_secret_ref: webhookSecretRef.trim(),
        },
        provider: channelType === "email" ? emailProvider : null,
        credentialsRef:
          channelType === "email" && emailProvider === "resend"
            ? credentialsRef
            : emailConnectionQuery.data
              ? `email_connection:${emailConnectionQuery.data.id}`
              : null,
      }),
    onSuccess: async () => {
      toast.success("Canale salvato");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["channel", channelId] }),
        queryClient.invalidateQueries({ queryKey: ["org-data", organizationId, "channels"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const rotateMutation = useMutation({
    mutationFn: () => rotateChannelApiKey(channelId),
    onSuccess: (key) => {
      setApiKey(key);
      toast.success("Nuova chiave generata: copiala ora");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const oauthMutation = useMutation({
    mutationFn: (provider: "microsoft" | "google") =>
      startEmailOAuth(organizationId!, channelId, provider),
    onSuccess: (authorizationUrl) => window.location.assign(authorizationUrl),
    onError: (error: Error) => toast.error(error.message),
  });
  const imapMutation = useMutation({
    mutationFn: () =>
      configureImapConnection({
        organizationId: organizationId!,
        channelId,
        emailAddress: emailFromAddress,
        displayName: emailFromName,
        password: imapPassword,
        imapHost,
        imapPort: Number(imapPort),
        imapSecurity,
        smtpHost,
        smtpPort: Number(smtpPort),
        smtpSecurity,
      }),
    onSuccess: async () => {
      setImapPassword("");
      toast.success("Parametri salvati in modo cifrato");
      await emailConnectionQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const disconnectMutation = useMutation({
    mutationFn: () => disconnectEmailConnection(organizationId!, channelId),
    onSuccess: async () => {
      toast.success("Casella scollegata");
      await Promise.all([emailConnectionQuery.refetch(), channelQuery.refetch()]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const syncMutation = useMutation({
    mutationFn: () => syncEmailConnection(organizationId!, channelId),
    onSuccess: async (result) => {
      toast.success(
        result.imported
          ? `Sincronizzazione completata: ${result.imported} nuove email`
          : "Connessione verificata: nessuna nuova email",
      );
      await emailConnectionQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const testMutation = useMutation({
    mutationFn: async () => {
      const text = testInput.trim();
      setTestMessages((items) => [...items, { role: "user", text }]);
      setTestInput("");
      return sendChannelMessage({
        publicId: channelQuery.data!.public_id,
        sessionId,
        message: text,
        apiKey: channelType === "api" ? apiKey : undefined,
      });
    },
    onSuccess: (result) =>
      setTestMessages((items) => [
        ...items,
        {
          role: "assistant",
          text: result.answer ?? "La conversazione è stata trasferita a un operatore.",
        },
      ]),
    onError: (error: Error) => toast.error(error.message),
  });

  if (channelQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Caricamento canale…</p>;
  const channel = channelQuery.data;
  if (!channel || channel.organization_id !== organizationId)
    return <p className="text-sm text-destructive">Canale non trovato o non accessibile.</p>;
  const canWrite = can("resources:write");

  return (
    <>
      <PageHeader
        title={name || "Configura canale"}
        description="Collega un agente pubblicato e controlla l’accesso al canale."
        actions={
          <Button asChild variant="outline">
            <Link to="/canali">
              <ArrowLeft className="size-4" />
              Torna ai canali
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>Configurazione</CardTitle>
            <CardDescription>
              Il canale diventa raggiungibile solo quando lo stato è Attivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field label="Nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                <Select
                  value={channelType}
                  onValueChange={(v) => setChannelType(v as ChannelType)}
                  disabled={!canWrite}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["webchat", "api", "email"] as ChannelType[]).map((value) => (
                      <SelectItem key={value} value={value}>
                        {CHANNEL_TYPE_LABELS[value]}
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
                    {Object.entries(ENTITY_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Agente pubblicato">
              <Select value={agentId} onValueChange={setAgentId} disabled={!canWrite}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona agente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessun agente</SelectItem>
                  {publishedAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name} · v{agent.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {channelType === "webchat" && (
              <>
                <Field label="Messaggio di benvenuto">
                  <Input
                    value={welcome}
                    onChange={(e) => setWelcome(e.target.value)}
                    disabled={!canWrite}
                  />
                </Field>
                <Field label="Testo del campo messaggio">
                  <Input
                    value={placeholder}
                    onChange={(e) => setPlaceholder(e.target.value)}
                    disabled={!canWrite}
                  />
                </Field>
                <Field label="Origini web autorizzate">
                  <Textarea
                    value={origins}
                    onChange={(e) => setOrigins(e.target.value)}
                    disabled={!canWrite}
                    placeholder={"https://azienda.it\nhttps://app.azienda.it"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Una origine è obbligatoria per attivare la webchat.
                  </p>
                </Field>
              </>
            )}
            {channelType === "email" && (
              <>
                <Field label="Provider della casella">
                  <Select
                    value={emailProvider}
                    onValueChange={(value) => setEmailProvider(value as EmailProvider)}
                    disabled={!canWrite || Boolean(emailConnectionQuery.data)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="microsoft">Microsoft 365 / Outlook</SelectItem>
                      <SelectItem value="google">Gmail / Google Workspace</SelectItem>
                      <SelectItem value="imap">Altro provider / PEC</SelectItem>
                      <SelectItem value="resend">Resend</SelectItem>
                    </SelectContent>
                  </Select>
                  {emailConnectionQuery.data && (
                    <p className="text-xs text-muted-foreground">
                      Scollega la casella corrente per cambiare provider.
                    </p>
                  )}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nome mittente">
                    <Input
                      value={emailFromName}
                      onChange={(e) => setEmailFromName(e.target.value)}
                      disabled={
                        !canWrite || (emailProvider !== "imap" && emailProvider !== "resend")
                      }
                      placeholder="Assistenza Azienda"
                    />
                  </Field>
                  <Field label="Indirizzo mittente">
                    <Input
                      type="email"
                      value={emailFromAddress}
                      onChange={(e) => setEmailFromAddress(e.target.value)}
                      disabled={
                        !canWrite || (emailProvider !== "imap" && emailProvider !== "resend")
                      }
                      placeholder="assistenza@azienda.it"
                    />
                  </Field>
                </div>
                {emailProvider === "resend" && (
                  <Field label="Indirizzo di ricezione">
                    <Input
                      type="email"
                      value={emailInboundAddress}
                      onChange={(e) => setEmailInboundAddress(e.target.value)}
                      disabled={!canWrite}
                      placeholder="supporto@inbound.azienda.it"
                    />
                  </Field>
                )}
                <Field label="Gestione delle nuove email">
                  <Select
                    value={emailReplyMode}
                    onValueChange={(value) => setEmailReplyMode(value as "operator" | "automatic")}
                    disabled={!canWrite}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operator">Gestione operatore</SelectItem>
                      <SelectItem value="automatic">Risposta AI automatica</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Firma">
                  <Textarea
                    value={emailSignature}
                    onChange={(e) => setEmailSignature(e.target.value)}
                    disabled={!canWrite}
                    placeholder="Il team assistenza"
                  />
                </Field>
                {emailProvider === "imap" && !emailConnectionQuery.data && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="flex items-center gap-2 font-medium">
                      <Server className="size-4" />
                      Parametri avanzati
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Server IMAP">
                        <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
                      </Field>
                      <Field label="Porta IMAP">
                        <Input
                          type="number"
                          value={imapPort}
                          onChange={(e) => setImapPort(e.target.value)}
                        />
                      </Field>
                      <Field label="Sicurezza IMAP">
                        <Select
                          value={imapSecurity}
                          onValueChange={(value) => setImapSecurity(value as "tls" | "starttls")}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tls">SSL/TLS</SelectItem>
                            <SelectItem value="starttls">STARTTLS</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Server SMTP">
                        <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
                      </Field>
                      <Field label="Porta SMTP">
                        <Input
                          type="number"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(e.target.value)}
                        />
                      </Field>
                      <Field label="Sicurezza SMTP">
                        <Select
                          value={smtpSecurity}
                          onValueChange={(value) => setSmtpSecurity(value as "tls" | "starttls")}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tls">SSL/TLS</SelectItem>
                            <SelectItem value="starttls">STARTTLS</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <Field label="Password per applicazioni">
                      <Input
                        type="password"
                        value={imapPassword}
                        onChange={(e) => setImapPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => imapMutation.mutate()}
                      disabled={
                        !canWrite ||
                        imapMutation.isPending ||
                        !emailFromAddress.trim() ||
                        !imapPassword ||
                        !imapHost.trim() ||
                        !smtpHost.trim()
                      }
                    >
                      <Plug className="size-4" />
                      Salva connessione cifrata
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      La connessione resterà in attesa finché il servizio di sincronizzazione non
                      avrà verificato IMAP e SMTP.
                    </p>
                  </div>
                )}
                {emailProvider === "resend" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Segreto API Resend">
                        <Input
                          value={credentialsRef}
                          onChange={(e) => setCredentialsRef(e.target.value.toUpperCase())}
                          disabled={!canWrite}
                        />
                      </Field>
                      <Field label="Segreto firma webhook">
                        <Input
                          value={webhookSecretRef}
                          onChange={(e) => setWebhookSecretRef(e.target.value.toUpperCase())}
                          disabled={!canWrite}
                        />
                      </Field>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Salviamo soltanto i nomi dei segreti configurati in Supabase, mai le chiavi.
                    </p>
                  </>
                )}
              </>
            )}
            {channelType !== "email" && (
              <Field label="Richieste al minuto per visitatore">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                  disabled={!canWrite}
                />
              </Field>
            )}
            {validation && <p className="text-sm text-destructive">{validation}</p>}
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canWrite || Boolean(validation) || saveMutation.isPending}
            >
              <Save className="size-4" />
              Salva canale
            </Button>
          </CardContent>
        </Card>
        <div className="space-y-4">
          {channelType === "api" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="size-4" />
                  Chiave API
                </CardTitle>
                <CardDescription>
                  La chiave completa viene mostrata soltanto dopo la rotazione.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {apiKey && (
                  <div className="flex gap-2">
                    <Input readOnly value={apiKey} className="font-mono text-xs" />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => void navigator.clipboard.writeText(apiKey)}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                )}
                <Button
                  variant="outline"
                  onClick={() => rotateMutation.mutate()}
                  disabled={!canWrite || rotateMutation.isPending}
                >
                  <KeyRound className="size-4" />
                  {channel.api_key_rotated_at ? "Rigenera chiave" : "Genera chiave"}
                </Button>
              </CardContent>
            </Card>
          )}
          {channelType === "email" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="size-4" />
                  Collegamento casella
                </CardTitle>
                <CardDescription>
                  Le credenziali sensibili non sono mai visibili nell’interfaccia.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {emailConnectionQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Controllo collegamento…</p>
                ) : emailConnectionQuery.data ? (
                  <>
                    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="font-medium">
                          {emailConnectionQuery.data.display_name ||
                            emailConnectionQuery.data.email_address}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {emailConnectionQuery.data.email_address}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {EMAIL_PROVIDER_LABELS[emailConnectionQuery.data.provider]}
                        </p>
                      </div>
                      <ConnectionBadge status={emailConnectionQuery.data.status} />
                    </div>
                    {emailConnectionQuery.data.last_error && (
                      <p className="text-sm text-destructive">
                        {emailConnectionQuery.data.last_error}
                      </p>
                    )}
                    {emailConnectionQuery.data.configuration.runtime_ready !== true && (
                      <p className="text-xs text-muted-foreground">
                        Autorizzazione salvata. Verifica la connessione per abilitare il canale.
                      </p>
                    )}
                    {["microsoft", "google"].includes(emailConnectionQuery.data.provider) && (
                      <Button
                        type="button"
                        onClick={() => syncMutation.mutate()}
                        disabled={!canWrite || syncMutation.isPending}
                      >
                        <RefreshCw
                          className={`size-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
                        />
                        {emailConnectionQuery.data.configuration.runtime_ready === true
                          ? "Sincronizza ora"
                          : "Verifica e sincronizza"}
                      </Button>
                    )}
                    {emailConnectionQuery.data.last_sync_at && (
                      <p className="text-xs text-muted-foreground">
                        Ultima sincronizzazione:{" "}
                        {formatDate(emailConnectionQuery.data.last_sync_at)}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => disconnectMutation.mutate()}
                      disabled={!canWrite || disconnectMutation.isPending}
                    >
                      <Unplug className="size-4" />
                      Scollega casella
                    </Button>
                  </>
                ) : emailProvider === "microsoft" || emailProvider === "google" ? (
                  <Button
                    onClick={() => oauthMutation.mutate(emailProvider)}
                    disabled={!canWrite || oauthMutation.isPending}
                  >
                    <Plug className="size-4" />
                    Collega con {emailProvider === "microsoft" ? "Microsoft" : "Google"}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {emailProvider === "imap"
                      ? "Inserisci i parametri IMAP e SMTP nella configurazione."
                      : "Configura i riferimenti ai segreti Resend nella configurazione."}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {channelType === "email" && emailProvider === "resend" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="size-4" />
                  Webhook Resend
                </CardTitle>
                <CardDescription>
                  Registra questo endpoint per il solo evento email.received.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    readOnly
                    className="font-mono text-xs"
                    value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-webhook?channel=${channel.public_id}`}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-webhook?channel=${channel.public_id}`,
                      )
                    }
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {channelType !== "email" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageCircle className="size-4" />
                  Prova canale
                </CardTitle>
                <CardDescription>{welcome}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="min-h-48 space-y-2 rounded-lg bg-muted/30 p-3">
                  {testMessages.map((item, index) => (
                    <div
                      key={index}
                      className={`rounded-xl px-3 py-2 text-sm ${item.role === "user" ? "ml-8 bg-primary text-primary-foreground" : "mr-8 bg-background"}`}
                    >
                      {item.text}
                    </div>
                  ))}
                  {!testMessages.length && (
                    <p className="pt-16 text-center text-sm text-muted-foreground">
                      Salva e attiva il canale per provarlo.
                    </p>
                  )}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (testInput.trim()) testMutation.mutate();
                  }}
                >
                  <Input
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                    placeholder={placeholder}
                    disabled={
                      testMutation.isPending ||
                      channel.status !== "active" ||
                      (channelType === "api" && !apiKey)
                    }
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!testInput.trim() || testMutation.isPending}
                  >
                    <Send className="size-4" />
                  </Button>
                </form>
                <p className="break-all text-xs text-muted-foreground">
                  ID pubblico: {channel.public_id}
                </p>
              </CardContent>
            </Card>
          )}
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

const EMAIL_PROVIDER_LABELS: Record<EmailProvider, string> = {
  microsoft: "Microsoft 365 / Outlook",
  google: "Gmail / Google Workspace",
  imap: "IMAP / SMTP",
  resend: "Resend",
};

function ConnectionBadge({
  status,
}: {
  status: "pending" | "connected" | "error" | "disconnected";
}) {
  if (status === "connected")
    return (
      <Badge className="gap-1">
        <CheckCircle2 className="size-3" />
        Collegata
      </Badge>
    );
  const labels = { pending: "Da verificare", error: "Errore", disconnected: "Scollegata" };
  return <Badge variant="secondary">{labels[status]}</Badge>;
}
