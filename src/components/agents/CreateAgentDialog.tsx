import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AGENT_TEMPLATES } from "@/config/agents";
import { createAgentFromTemplate } from "@/services/agents";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  organizationId: string;
  userId: string;
  disabled?: boolean;
  onCreated: (agentId: string) => void;
};

export function CreateAgentDialog({ organizationId, userId, disabled, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(AGENT_TEMPLATES[0]?.id ?? "");
  const template = AGENT_TEMPLATES.find((item) => item.id === templateId)!;
  const [name, setName] = useState(template?.name ?? "");

  const mutation = useMutation({
    mutationFn: () => createAgentFromTemplate({ organizationId, userId, name, template }),
    onSuccess: async (agentId) => {
      await queryClient.invalidateQueries({ queryKey: ["org-data", organizationId, "agents"] });
      toast.success("Agente creato: completa la configurazione");
      setOpen(false);
      onCreated(agentId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function chooseTemplate(id: string) {
    const selected = AGENT_TEMPLATES.find((item) => item.id === id);
    if (!selected) return;
    setTemplateId(id);
    setName(selected.name);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus className="size-4" /> Nuovo agente
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crea un agente AI</DialogTitle>
          <DialogDescription>
            Parti da un modello operativo. Tutti i dati saranno copiati nella tua organizzazione.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Modello</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {AGENT_TEMPLATES.map((item) => (
                <Card
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => chooseTemplate(item.id)}
                  onKeyDown={(event) => event.key === "Enter" && chooseTemplate(item.id)}
                  className={`cursor-pointer p-4 transition-colors ${
                    templateId === item.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <Sparkles className="size-4 text-primary" /> {item.name}
                  </div>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </Card>
              ))}
              <Card className="border-dashed p-4 opacity-60">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <Bot className="size-4" /> Altri modelli
                </div>
                <p className="text-sm text-muted-foreground">
                  Saranno aggiunti nella prossima evoluzione.
                </p>
              </Card>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-name">Nome agente</Label>
            <Input id="agent-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annulla
          </Button>
          <Button disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            Crea e configura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
