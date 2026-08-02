import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, PhoneCall, MessageSquare, Mail, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FMS AI Platform — Agenti AI multicanale" },
      {
        name: "description",
        content:
          "FMS AI Platform: la base per gestire agenti AI su telefono, WhatsApp, email e documenti con canali, tool, workflow e log.",
      },
      { property: "og:title", content: "FMS AI Platform — Agenti AI multicanale" },
      {
        property: "og:description",
        content: "Gestisci agenti AI su telefono, WhatsApp, email e documenti da un'unica piattaforma.",
      },
    ],
  }),
  component: Landing,
});

const channels = [
  { icon: PhoneCall, label: "Telefono" },
  { icon: MessageSquare, label: "WhatsApp" },
  { icon: Mail, label: "Email" },
  { icon: FileText, label: "Documenti" },
];

function Landing() {
  return (
    <div className="gradient-hero relative min-h-screen">
      <div className="surface-grid absolute inset-0 opacity-40" />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5 text-sidebar-foreground">
          <span className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="font-display text-base font-semibold">FMS AI Platform</span>
        </div>
        <Button asChild size="sm">
          <Link to="/auth">Accedi</Link>
        </Button>
      </header>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-10 px-6 py-24">
        <div className="max-w-2xl space-y-6">
          <span className="inline-flex items-center rounded-full border border-sidebar-border px-3 py-1 text-xs text-sidebar-foreground/70">
            Fondamenta della piattaforma
          </span>
          <h1 className="text-gradient-brand font-display text-5xl font-semibold leading-[1.05] sm:text-6xl">
            Agenti AI per telefono, WhatsApp, email e documenti
          </h1>
          <p className="max-w-xl text-base text-sidebar-foreground/70">
            Una struttura modulare e professionale: agenti, canali, tool, workflow e log, pronti per
            essere estesi con la logica di business.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Entra nella dashboard</Link>
            </Button>
          </div>
        </div>

        <ul className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {channels.map((c) => (
            <li
              key={c.label}
              className="flex items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar/60 px-4 py-3 text-sidebar-foreground backdrop-blur"
            >
              <c.icon className="size-4 text-sidebar-primary" />
              <span className="text-sm font-medium">{c.label}</span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
