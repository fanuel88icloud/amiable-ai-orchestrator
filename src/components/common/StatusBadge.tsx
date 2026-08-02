import { Badge } from "@/components/ui/badge";
import { ENTITY_STATUS_LABELS, type EntityStatus } from "@/types/platform";

const VARIANTS: Record<EntityStatus, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  draft: "secondary",
  paused: "outline",
  archived: "outline",
};

export function StatusBadge({ status }: { status: EntityStatus }) {
  return <Badge variant={VARIANTS[status]}>{ENTITY_STATUS_LABELS[status]}</Badge>;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
