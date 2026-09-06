import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";

import { fetchAgentTools, setAgentTool } from "@/services/agents";
import { fetchTools } from "@/services/entities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type Props = {
  agentId: string;
  organizationId: string;
  canWrite: boolean;
};

export function AgentToolsPanel({ agentId, organizationId, canWrite }: Props) {
  const toolsQuery = useQuery({
    queryKey: ["org-data", organizationId, "tools"],
    queryFn: () => fetchTools(organizationId),
  });
  const linksQuery = useQuery({
    queryKey: ["agent-tools", agentId],
    queryFn: () => fetchAgentTools(agentId),
  });
  const enabledIds = new Set(
    (linksQuery.data ?? []).filter((link) => link.is_enabled).map((link) => link.tool_id),
  );

  async function toggle(toolId: string, enabled: boolean) {
    await setAgentTool({ organizationId, agentId, toolId, enabled });
    await linksQuery.refetch();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="size-5" /> Tool disponibili
        </CardTitle>
        <CardDescription>
          Scegli quali strumenti potrà utilizzare l’agente. Nel simulatore vengono mostrati come
          configurati, senza eseguire ancora azioni reali.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {toolsQuery.isLoading || linksQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento tool…</p>
        ) : toolsQuery.data?.length ? (
          toolsQuery.data.map((tool) => (
            <div
              key={tool.id}
              className="flex items-center justify-between gap-4 rounded-lg border p-4"
            >
              <div>
                <p className="font-medium">{tool.name}</p>
                <p className="text-sm text-muted-foreground">
                  {tool.description || tool.tool_type}
                </p>
              </div>
              <Switch
                disabled={!canWrite}
                checked={enabledIds.has(tool.id)}
                onCheckedChange={(enabled) => void toggle(tool.id, enabled)}
              />
            </div>
          ))
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nessun tool disponibile. Crealo prima nella sezione Tool.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
