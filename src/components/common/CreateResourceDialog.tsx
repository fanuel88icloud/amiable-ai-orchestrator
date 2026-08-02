import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectFieldConfig = {
  label: string;
  options: { value: string; label: string }[];
  defaultValue: string;
};

/**
 * Generic creation dialog shared by the resource modules.
 * The caller owns the mutation: this component only collects input.
 */
export function CreateResourceDialog({
  title,
  description,
  triggerLabel,
  disabled,
  withDescription = true,
  select,
  queryKey,
  onSubmit,
  trigger,
}: {
  title: string;
  description: string;
  triggerLabel: string;
  disabled?: boolean;
  withDescription?: boolean;
  select?: SelectFieldConfig;
  queryKey: unknown[];
  onSubmit: (values: { name: string; description: string; select: string }) => Promise<void>;
  trigger?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [selectValue, setSelectValue] = useState(select?.defaultValue ?? "");

  const mutation = useMutation({
    mutationFn: () => onSubmit({ name, description: desc, select: selectValue }),
    onSuccess: async () => {
      toast.success("Elemento creato");
      setName("");
      setDesc("");
      setSelectValue(select?.defaultValue ?? "");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button disabled={disabled}>
            <Plus className="size-4" />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="resource-name">Nome</Label>
            <Input
              id="resource-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome"
            />
          </div>
          {select ? (
            <div className="space-y-2">
              <Label>{select.label}</Label>
              <Select value={selectValue} onValueChange={setSelectValue}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {select.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {withDescription ? (
            <div className="space-y-2">
              <Label htmlFor="resource-desc">Descrizione</Label>
              <Textarea
                id="resource-desc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annulla
          </Button>
          <Button disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            Crea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
