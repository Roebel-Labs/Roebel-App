// Credential type templates and the type form rules. Copies of apps/web/src/lib/credentials/templates.ts
// (plan 2 Task 3) and the dashboard's validateTypeForm (plan 4 Task 2): Studio cannot import from
// apps/web. The test pins the German messages so both stay the same.
import { t } from '../i18n';
import type { Kind, TypePreparePayload } from './types';

export type TemplateId = 'mitglied' | 'vorstand' | 'mitarbeiter' | 'ehrenmitglied' | 'stadtvertreter' | 'abzeichen';

/** German labels, translated where shown (t(label)): no t() at module level. */
export const STUDIO_TEMPLATES: ReadonlyArray<{ id: TemplateId; label: string; kind: Kind; description: string }> = [
  { id: 'mitglied', label: 'Mitglied', kind: 'membership', description: 'Bestätigt die Mitgliedschaft in der Organisation.' },
  { id: 'vorstand', label: 'Vorstand', kind: 'role', description: 'Bestätigt ein Amt im Vorstand der Organisation.' },
  { id: 'mitarbeiter', label: 'Mitarbeiter:in', kind: 'membership', description: 'Bestätigt, dass die Person für die Organisation arbeitet.' },
  { id: 'ehrenmitglied', label: 'Ehrenmitglied', kind: 'membership', description: 'Ehrt besondere Verdienste um die Organisation.' },
  { id: 'stadtvertreter', label: 'Stadtvertreter:in', kind: 'role', description: 'Bestätigt ein Mandat in der Stadtvertretung.' },
  { id: 'abzeichen', label: 'Abzeichen', kind: 'badge', description: 'Erinnert an eine Teilnahme oder eine besondere Leistung.' },
];

/** Kind labels of the dashboard ("Amt", "Mitgliedschaft", "Abzeichen"), German. */
export const KIND_LABELS: Record<Kind, string> = { role: 'Amt', membership: 'Mitgliedschaft', badge: 'Abzeichen' };

export interface TypeForm {
  template: TemplateId | 'eigener';
  name: string;
  description: string;
  imageUrl: string | null;
  benefits: string[];
  kind: Kind;
  /** Empty = no limit. */
  supplyCap: string;
  /** yyyy-mm-dd or empty. */
  claimStart: string;
  claimEnd: string;
}

export function formFromTemplate(id: TemplateId): TypeForm {
  const x = STUDIO_TEMPLATES.find((tpl) => tpl.id === id)!;
  return { template: id, name: x.label, description: x.description, imageUrl: null, benefits: [], kind: x.kind, supplyCap: '', claimStart: '', claimEnd: '' };
}

export function emptyForm(kind: Kind = 'membership'): TypeForm {
  return { template: 'eigener', name: '', description: '', imageUrl: null, benefits: [], kind, supplyCap: '', claimStart: '', claimEnd: '' };
}

/** German message per field; {} = valid. Same rules and texts as the dashboard. */
export function validateType(f: TypeForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = f.name.trim();
  if (name.length < 2 || name.length > 60) errors.name = t('Der Name muss 2 bis 60 Zeichen lang sein.');
  if (f.description.trim().length > 300) errors.description = t('Die Beschreibung darf höchstens 300 Zeichen lang sein.');
  const benefits = f.benefits.map((b) => b.trim()).filter(Boolean);
  if (benefits.length > 6 || benefits.some((b) => b.length > 80)) errors.benefits = t('Höchstens 6 Vorteile mit je bis zu 80 Zeichen.');
  const cap = f.supplyCap.trim();
  if (cap !== '' && !(/^\d+$/.test(cap) && Number(cap) >= 1 && Number(cap) <= 100000)) errors.supplyCap = t('Die Höchstzahl muss eine ganze Zahl von 1 bis 100000 sein.');
  if (f.claimStart && f.claimEnd && Date.parse(f.claimEnd) <= Date.parse(f.claimStart)) errors.claimEnd = t('Das Ende muss nach dem Beginn liegen.');
  return errors;
}

/** The type_prepare payload of plan 2. The kind cannot change on update, so it is left out there. */
export function typeFormToPayload(f: TypeForm, accountId: string, op: 'create' | 'update', typeId?: string): TypePreparePayload {
  const p: TypePreparePayload = {
    accountId,
    op,
    name: f.name.trim(),
    description: f.description.trim(),
    benefits: f.benefits.map((b) => b.trim()).filter(Boolean),
    supplyCap: f.supplyCap.trim() === '' ? 0 : Number(f.supplyCap.trim()),
  };
  if (f.imageUrl) p.imageUrl = f.imageUrl;
  if (f.claimStart) p.claimStart = f.claimStart;
  if (f.claimEnd) p.claimEnd = f.claimEnd;
  if (op === 'create') {
    p.kind = f.kind;
    if (f.template !== 'eigener') p.template = f.template;
  } else {
    p.typeId = typeId;
  }
  return p;
}
