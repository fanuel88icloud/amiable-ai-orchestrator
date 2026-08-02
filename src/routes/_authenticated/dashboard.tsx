import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { navItems } from "@/config/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | FMS AI Platform" },
      {
        name: "description",
        content:
          "Panoramica operativa della piattaforma FMS AI: agenti, canali, tool, workflow e log.",
      },
      { property: "og:title", content: "Dashboard | FMS AI Platform" },
      {
        property: "og:description",
        content: "Panoramica operativa degli agenti AI su telefono, WhatsApp, email e documenti.",
      },
    ],
  }),
  component: DashboardPage,
});

const stats = [
  { label: "Agenti attivi", value: "—" },
  { label: "Canali collegati", value: "—" },
  { label: "Workflow", value: "—" },
  { label: "Eventi 24h", value: "—" },
];

function DashboardPage() {
  const modules = navItems.filter((item) => item.url !== "/dashboard");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Struttura iniziale della piattaforma. I moduli sono pronti per essere estesi con logica applicativa."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="font-display text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">In attesa di dati</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => (
          <Link key={item.url} to={item.url} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <item.icon className="size-4" />
                  </span>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
