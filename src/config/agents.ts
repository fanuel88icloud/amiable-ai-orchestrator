/**
 * Central agent configuration registry.
 * UI components must read agent types, languages and instruction sections from
 * here; model names come from the `ai_models` table (never hardcoded in the UI).
 */

export const AGENT_TYPES = [
  { value: "reception", label: "Reception" },
  { value: "customer_service", label: "Assistenza clienti" },
  { value: "secretary", label: "Segreteria" },
  { value: "administration", label: "Amministrazione" },
  { value: "accounting", label: "Contabilità" },
  { value: "sales", label: "Commerciale" },
  { value: "custom", label: "Personalizzato" },
] as const;

export type AgentTypeValue = (typeof AGENT_TYPES)[number]["value"];

export const AGENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  AGENT_TYPES.map((t) => [t.value, t.label]),
);

export const AGENT_LANGUAGES = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "Inglese" },
  { value: "fr", label: "Francese" },
  { value: "de", label: "Tedesco" },
  { value: "es", label: "Spagnolo" },
] as const;

export const AGENT_INITIAL_STATUSES = [
  { value: "draft", label: "Bozza" },
  { value: "active", label: "Attivo" },
  { value: "paused", label: "In pausa" },
] as const;

export type InstructionSections = {
  identity: string;
  goals: string;
  tone: string;
  allowed: string;
  forbidden: string;
  escalation: string;
};

export const INSTRUCTION_FIELDS: { key: keyof InstructionSections; label: string; hint: string }[] =
  [
    { key: "identity", label: "Identità", hint: "Chi è l'agente e per conto di chi parla." },
    { key: "goals", label: "Obiettivi", hint: "Cosa deve ottenere durante la conversazione." },
    { key: "tone", label: "Tono", hint: "Stile e registro comunicativo." },
    { key: "allowed", label: "Attività consentite", hint: "Cosa può fare." },
    { key: "forbidden", label: "Attività vietate", hint: "Cosa non deve mai fare." },
    { key: "escalation", label: "Regole di escalation", hint: "Quando coinvolgere una persona." },
  ];

export const EMPTY_SECTIONS: InstructionSections = {
  identity: "",
  goals: "",
  tone: "",
  allowed: "",
  forbidden: "",
  escalation: "",
};

const SECTION_TITLES: Record<keyof InstructionSections, string> = {
  identity: "IDENTITÀ",
  goals: "OBIETTIVI",
  tone: "TONO",
  allowed: "ATTIVITÀ CONSENTITE",
  forbidden: "ATTIVITÀ VIETATE",
  escalation: "REGOLE DI ESCALATION",
};

/** Combines the editable sections into the final system prompt. */
export function buildSystemInstructions(
  sections: InstructionSections,
  fallbackMessage?: string | null,
): string {
  const parts = INSTRUCTION_FIELDS.filter((f) => sections[f.key]?.trim()).map(
    (f) => `## ${SECTION_TITLES[f.key]}\n${sections[f.key].trim()}`,
  );
  if (fallbackMessage?.trim()) {
    parts.push(`## MESSAGGIO DI FALLBACK\n${fallbackMessage.trim()}`);
  }
  return parts.join("\n\n");
}

export function parseSections(value: unknown): InstructionSections {
  if (!value || typeof value !== "object") return { ...EMPTY_SECTIONS };
  const raw = value as Record<string, unknown>;
  const out = { ...EMPTY_SECTIONS };
  for (const field of INSTRUCTION_FIELDS) {
    const v = raw[field.key];
    if (typeof v === "string") out[field.key] = v;
  }
  return out;
}

export type AgentTemplate = {
  id: string;
  name: string;
  description: string;
  agentType: AgentTypeValue;
  language: string;
  fallbackMessage: string;
  handoffEnabled: boolean;
  sections: InstructionSections;
};

/** Templates are copied into the tenant's own agent row: no data is shared between organizations. */
export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "reception-ai",
    name: "Reception AI",
    description:
      "Accoglie il cliente, comprende il motivo del contatto, raccoglie le informazioni essenziali e indirizza la richiesta verso il reparto o l'operatore corretto.",
    agentType: "reception",
    language: "it",
    handoffEnabled: true,
    fallbackMessage:
      "Non ho questa informazione: inoltro subito la richiesta a un operatore che la ricontatterà.",
    sections: {
      identity: "Sei un addetto alla reception virtuale di un'azienda.",
      goals: [
        "Salutare il cliente.",
        "Chiedere come puoi aiutarlo.",
        "Comprendere il motivo del contatto.",
        "Raccogliere nome, recapito e informazioni essenziali.",
        "Riepilogare quanto compreso.",
        "Indirizzare la richiesta al reparto corretto.",
      ]
        .map((l) => `- ${l}`)
        .join("\n"),
      tone: "Parla in italiano con tono professionale, cordiale e naturale.",
      allowed:
        "- Raccogliere i dati di contatto e il motivo della chiamata.\n- Riepilogare e classificare la richiesta.\n- Indicare il reparto competente.",
      forbidden:
        "- Non inventare informazioni, appuntamenti, prezzi, nomi, date o disponibilità.\n- Non dichiarare di avere eseguito un'azione se non hai ricevuto conferma dal relativo tool.",
      escalation:
        "Chiedi l'intervento di una persona quando non sei autorizzato a procedere. Quando non conosci la risposta, informa il cliente che la richiesta sarà inoltrata a un operatore.",
    },
  },
];
