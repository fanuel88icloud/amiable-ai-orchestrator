import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { ResourceList } from "@/components/common/ResourceList";
import { CreateResourceDialog } from "@/components/common/CreateResourceDialog";
import { NoOrganizationState } from "@/components/organization/NoOrganizationState";
import { useOrganization } from "@/hooks/useOrganization";
import { createChannel, fetchChannels } from "@/services/entities";
import { CHANNEL_TYPE_LABELS, type ChannelType } from "@/types/platform";

export const Route = createFileRoute("/_authenticated/canali")({
  head: () => ({
    meta: [
      { title: "Canali | FMS AI Platform" },
      {
        name: "description",
        content: "Canali di contatto dell'organizzazione: voce, WhatsApp, email, web chat e API.",
      },
      { property: "og:title", content: "Canali | FMS AI Platform" },
      {
        property: "og:description",
        content: "Configura i canali su cui operano gli agenti dell'organizzazione.",
      },
    ],
  }),
  component: CanaliPage,
});

function CanaliPage() {
  const { organizationId, user, can, isLoading: orgLoading } = useOrganization();

  const query = useQuery({
    queryKey: ["org-data", organizationId, "channels"],
    queryFn: () => fetchChannels(organizationId!),
    enabled: Boolean(organizationId),
  });

  if (!orgLoading && !organizationId) {
    return (
      <>
        <PageHeader title="Canali" description="Canali dell'organizzazione attiva." />
        <NoOrganizationState />
      </>
    );
  }

  const canWrite = can("resources:write");
  const createDialog = (
    <CreateResourceDialog
      title="Nuovo canale"
      description="Le credenziali delle integrazioni non vengono salvate in chiaro nella configurazione."
      triggerLabel="Nuovo canale"
      withDescription={false}
      disabled={!canWrite}
      select={{
        label: "Tipo di canale",
        defaultValue: "voice",
        options: Object.entries(CHANNEL_TYPE_LABELS).map(([value, label]) => ({ value, label })),
      }}
      queryKey={["org-data", organizationId, "channels"]}
      onSubmit={({ name, select }) =>
        createChannel({
          organizationId: organizationId!,
          userId: user.id,
          name,
          channelType: select as ChannelType,
        })
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Canali"
        description="Elenco dei canali dell'organizzazione attiva."
        actions={canWrite ? createDialog : undefined}
      />
      <ResourceList
        isLoading={orgLoading || query.isLoading}
        metaLabel="Tipo"
        rows={(query.data ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          createdAt: c.created_at,
          meta: CHANNEL_TYPE_LABELS[c.channel_type],
        }))}
        emptyIcon={Radio}
        emptyTitle="Nessun canale collegato"
        emptyDescription="Aggiungi un canale per definire dove gli agenti riceveranno le conversazioni."
        emptyAction={canWrite ? createDialog : undefined}
      />
    </>
  );
}
