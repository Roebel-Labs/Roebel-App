// Starting points for a new credential type. The org edits name, description and benefits;
// validity is 0 for all (the org sets an end date per batch).
export type TemplateKey = "mitglied" | "vorstand" | "mitarbeiter" | "ehrenmitglied" | "stadtvertreter" | "abzeichen";

export type TypeTemplate = {
  name: string;
  kind: "role" | "membership" | "badge";
  description: string;
  defaultValiditySeconds: number;
  benefits: string[];
};

export const TYPE_TEMPLATES: Record<TemplateKey, TypeTemplate> = {
  mitglied: {
    name: "Mitglied",
    kind: "membership",
    description: "Bestätigt die Mitgliedschaft in der Organisation.",
    defaultValiditySeconds: 0,
    benefits: [],
  },
  vorstand: {
    name: "Vorstand",
    kind: "role",
    description: "Bestätigt ein Amt im Vorstand der Organisation.",
    defaultValiditySeconds: 0,
    benefits: [],
  },
  mitarbeiter: {
    name: "Mitarbeiter:in",
    kind: "membership",
    description: "Bestätigt, dass die Person für die Organisation arbeitet.",
    defaultValiditySeconds: 0,
    benefits: [],
  },
  ehrenmitglied: {
    name: "Ehrenmitglied",
    kind: "membership",
    description: "Ehrt besondere Verdienste um die Organisation.",
    defaultValiditySeconds: 0,
    benefits: [],
  },
  stadtvertreter: {
    name: "Stadtvertreter:in",
    kind: "role",
    description: "Bestätigt ein Mandat in der Stadtvertretung.",
    defaultValiditySeconds: 0,
    benefits: [],
  },
  abzeichen: {
    name: "Abzeichen",
    kind: "badge",
    description: "Erinnert an eine Teilnahme oder eine besondere Leistung.",
    defaultValiditySeconds: 0,
    benefits: [],
  },
};

export function isTemplateKey(v: unknown): v is TemplateKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(TYPE_TEMPLATES, v);
}
