import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type PlaceholderBlock = {
  title: string;
  description: string;
  icon?: LucideIcon;
  status?: string;
};

/**
 * Reusable scaffold for modules that have no business logic yet.
 * Replace the blocks with real data as each module is implemented.
 */
export function ModulePlaceholder({ blocks }: { blocks: PlaceholderBlock[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {blocks.map((block) => (
        <Card key={block.title} className="border-dashed">
          <CardHeader className="gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {block.icon ? (
                  <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <block.icon className="size-4" />
                  </span>
                ) : null}
                <CardTitle className="text-base">{block.title}</CardTitle>
              </div>
              <Badge variant="secondary">{block.status ?? "Da configurare"}</Badge>
            </div>
            <CardDescription>{block.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-20 rounded-md border border-dashed border-border bg-muted/40" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
