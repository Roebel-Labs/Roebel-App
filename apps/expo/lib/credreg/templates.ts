/**
 * Starting points for a new credential type on the phone ("Neuer Ausweis-Typ"). A copy of the
 * dashboard's templates (apps/web/src/lib/credentials/templates.ts and formFromTemplate in
 * type-form.ts): keep both in step. Validity is 0 for all; the org sets an end date per batch.
 */
import type { CredentialKind } from './types';

export type TemplateKey = 'mitglied' | 'vorstand' | 'mitarbeiter' | 'ehrenmitglied' | 'stadtvertreter' | 'abzeichen';

export type TypeTemplate = { name: string; kind: CredentialKind; description: string; benefits: string[] };

export const TYPE_TEMPLATES: Record<TemplateKey, TypeTemplate> = {
  mitglied: { name: 'Mitglied', kind: 'membership', description: 'Bestätigt die Mitgliedschaft in der Organisation.', benefits: [] },
  vorstand: { name: 'Vorstand', kind: 'role', description: 'Bestätigt ein Amt im Vorstand der Organisation.', benefits: [] },
  mitarbeiter: { name: 'Mitarbeiter:in', kind: 'membership', description: 'Bestätigt, dass die Person für die Organisation arbeitet.', benefits: [] },
  ehrenmitglied: { name: 'Ehrenmitglied', kind: 'membership', description: 'Ehrt besondere Verdienste um die Organisation.', benefits: [] },
  stadtvertreter: { name: 'Stadtvertreter:in', kind: 'role', description: 'Bestätigt ein Mandat in der Stadtvertretung.', benefits: [] },
  abzeichen: { name: 'Abzeichen', kind: 'badge', description: 'Erinnert an eine Teilnahme oder eine besondere Leistung.', benefits: [] },
};

export const KIND_LABEL: Record<CredentialKind, string> = { role: 'Amt', membership: 'Mitgliedschaft', badge: 'Abzeichen' };

/** The type_prepare create payload for a template with the phone form's edits. */
export function templatePayload(
  key: TemplateKey,
  edits: { name?: string; description?: string; benefits?: string[] } = {},
): { op: 'create'; template: TemplateKey; kind: CredentialKind; name: string; description: string; benefits: string[]; supplyCap: number } {
  const t = TYPE_TEMPLATES[key];
  return {
    op: 'create',
    template: key,
    kind: t.kind,
    name: (edits.name ?? t.name).trim(),
    description: (edits.description ?? t.description).trim(),
    benefits: (edits.benefits ?? t.benefits).map((b) => b.trim()).filter(Boolean),
    supplyCap: 0,
  };
}

/** Same rules as the dashboard: name 2–60, description ≤ 300. German message or null. */
export function templateFormError(p: { name: string; description: string }): string | null {
  const name = p.name.trim();
  if (name.length < 2 || name.length > 60) return 'Der Name muss 2 bis 60 Zeichen lang sein.';
  if (p.description.length > 300) return 'Die Beschreibung darf höchstens 300 Zeichen lang sein.';
  return null;
}
