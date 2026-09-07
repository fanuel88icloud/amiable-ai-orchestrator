import {
  LayoutDashboard,
  Bot,
  Radio,
  Wrench,
  Workflow,
  ScrollText,
  MessagesSquare,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  description: string;
  url: string;
  icon: LucideIcon;
};

/**
 * Single source of truth for the platform navigation.
 * Add a new module here and create the matching route under
 * `src/routes/_authenticated/` to extend the platform.
 */
export const navItems: NavItem[] = [
  {
    title: "Dashboard",
    description: "Panoramica operativa della piattaforma",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Agenti AI",
    description: "Configurazione e ciclo di vita degli agenti",
    url: "/agenti",
    icon: Bot,
  },
  {
    title: "Canali",
    description: "Telefono, WhatsApp, email e documenti",
    url: "/canali",
    icon: Radio,
  },
  {
    title: "Conversazioni",
    description: "Inbox unificata e passaggio agli operatori",
    url: "/conversazioni",
    icon: MessagesSquare,
  },
  {
    title: "Tool",
    description: "Strumenti e integrazioni disponibili agli agenti",
    url: "/tool",
    icon: Wrench,
  },
  {
    title: "Workflow",
    description: "Orchestrazione dei processi automatizzati",
    url: "/workflow",
    icon: Workflow,
  },
  {
    title: "Log",
    description: "Tracciamento eventi ed esecuzioni",
    url: "/log",
    icon: ScrollText,
  },
  {
    title: "Impostazioni",
    description: "Preferenze account e workspace",
    url: "/impostazioni",
    icon: Settings,
  },
];
