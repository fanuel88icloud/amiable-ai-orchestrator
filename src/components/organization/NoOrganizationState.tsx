import { Building2 } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { CreateOrganizationDialog } from "@/components/organization/OrganizationSwitcher";

/** Shown when the signed-in user does not belong to any organization yet. */
export function NoOrganizationState() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <EmptyState
        icon={Building2}
        title="Nessuna organizzazione attiva"
        description="Crea la tua organizzazione per iniziare a configurare agenti, canali, tool e workflow. Ogni organizzazione mantiene i dati completamente separati."
        action={<Button onClick={() => setOpen(true)}>Crea organizzazione</Button>}
      />
      <CreateOrganizationDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
