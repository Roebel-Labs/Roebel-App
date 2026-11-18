// The dashboard's credential type form: templates, validation (German messages per field) and
// the type_prepare payload of lib/credentials/actions.ts. Runs in the browser.
// Relative imports only: loaded by `npx tsx --test`.
import { TYPE_TEMPLATES, type TemplateKey } from "./templates";

export type TypeForm = {
  template: keyof typeof TYPE_TEMPLATES | "eigener";
  name: string;
  description: string;
  imageUrl: string | null;
  benefits: string[];
  kind: "role" | "membership" | "badge";
  /** "" = no limit. */
  supplyCap: string;
  /** datetime-local value ("YYYY-MM-DDTHH:mm", browser time), "" = none. */
  claimStart: string;
  claimEnd: string;
};

export const TEMPLATE_CHOICES: { key: TypeForm["template"]; label: string }[] = [
  { key: "mitglied", label: "Mitglied" },
  { key: "vorstand", label: "Vorstand" },
  { key: "mitarbeiter", label: "Mitarbeiter:in" },
  { key: "ehrenmitglied", label: "Ehrenmitglied" },
  { key: "stadtvertreter", label: "Stadtvertreter:in" },
  { key: "eigener", label: "Eigener" },
];

export const KIND_LABELS: Record<TypeForm["kind"], string> = { role: "Amt", membership: "Mitgliedschaft", badge: "Abzeichen" };

export const MAX_BENEFITS = 6;

export function formFromTemplate(t: TemplateKey): TypeForm {
  const tpl = TYPE_TEMPLATES[t];
  return {
    template: t,
    name: tpl.name,
    description: tpl.description,
    imageUrl: null,
    benefits: [...tpl.benefits],
    kind: tpl.kind,
    supplyCap: "",
    claimStart: "",
    claimEnd: "",
  };
}

/** A blank "Eigener" form (membership by default). */
export function blankForm(): TypeForm {
  return { template: "eigener", name: "", description: "", imageUrl: null, benefits: [], kind: "membership", supplyCap: "", claimStart: "", claimEnd: "" };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO → datetime-local value in the browser's time zone. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** An existing type (types_list row) as the edit form. */
export function formFromType(t: {
  typeId: string;
  name: string;
  kind: TypeForm["kind"] | null;
  description: string | null;
  imageUrl: string | null;
  benefits: string[];
  template: string | null;
  supplyCap: number;
  claimStart: string | null;
  claimEnd: string | null;
}): TypeForm {
  const template = t.template && Object.prototype.hasOwnProperty.call(TYPE_TEMPLATES, t.template) ? (t.template as TemplateKey) : "eigener";
  return {
    template,
    name: t.name,
    description: t.description ?? "",
    imageUrl: t.imageUrl,
    benefits: [...t.benefits],
    kind: t.kind ?? "membership",
    supplyCap: t.supplyCap > 0 ? String(t.supplyCap) : "",
    claimStart: isoToLocalInput(t.claimStart),
    claimEnd: isoToLocalInput(t.claimEnd),
  };
}

const cleanBenefits = (b: string[]) => b.map((x) => x.trim()).filter(Boolean);

/** German message per field; `{}` = valid. */
export function validateTypeForm(f: TypeForm): Record<string, string> {
  const e: Record<string, string> = {};
  const name = f.name.trim();
  if (name.length < 2 || name.length > 60) e.name = "Der Name muss 2 bis 60 Zeichen lang sein.";
  if (f.description.length > 300) e.description = "Die Beschreibung darf höchstens 300 Zeichen lang sein.";
  const benefits = cleanBenefits(f.benefits);
  if (benefits.length > MAX_BENEFITS) e.benefits = `Höchstens ${MAX_BENEFITS} Vorteile.`;
  else if (benefits.some((b) => b.length > 80)) e.benefits = "Jeder Vorteil darf höchstens 80 Zeichen lang sein.";
  const cap = f.supplyCap.trim();
  if (cap !== "" && (!/^\d+$/.test(cap) || Number(cap) < 1 || Number(cap) > 100_000)) {
    e.supplyCap = "Die Höchstzahl muss eine ganze Zahl zwischen 1 und 100.000 sein (oder leer).";
  }
  const start = f.claimStart ? Date.parse(f.claimStart) : NaN;
  const end = f.claimEnd ? Date.parse(f.claimEnd) : NaN;
  if (f.claimStart && Number.isNaN(start)) e.claimStart = "Ungültiges Datum.";
  if (f.claimEnd && Number.isNaN(end)) e.claimEnd = "Ungültiges Datum.";
  else if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) e.claimEnd = "Das Ende muss nach dem Beginn liegen.";
  return e;
}

/**
 * The type_prepare payload. Create: empty dates and image are left out, `template` only for a real
 * template. Update: no `kind` (it cannot change) and no `template`; an emptied date or image is
 * sent as "" so the server clears it. An empty cap is 0 (no limit) in both.
 */
export function typeFormToPayload(f: TypeForm, op: "create" | "update", typeId?: string): Record<string, unknown> {
  const p: Record<string, unknown> = {
    op,
    name: f.name.trim(),
    description: f.description.trim(),
    benefits: cleanBenefits(f.benefits),
    supplyCap: f.supplyCap.trim() === "" ? 0 : Number(f.supplyCap.trim()),
  };
  const iso = (v: string) => new Date(v).toISOString();
  if (op === "create") {
    p.kind = f.kind;
    if (f.template !== "eigener") p.template = f.template;
    if (f.imageUrl) p.imageUrl = f.imageUrl;
    if (f.claimStart) p.claimStart = iso(f.claimStart);
    if (f.claimEnd) p.claimEnd = iso(f.claimEnd);
  } else {
    p.typeId = typeId;
    p.imageUrl = f.imageUrl ?? "";
    p.claimStart = f.claimStart ? iso(f.claimStart) : "";
    p.claimEnd = f.claimEnd ? iso(f.claimEnd) : "";
  }
  return p;
}
