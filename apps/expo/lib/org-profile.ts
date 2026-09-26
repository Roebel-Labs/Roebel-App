/**
 * Display helpers shared by the org detail screen (app/account/[id]) and the
 * Erkunden cards: rating text, open/closed line, category label, share URL.
 */
import type { Account, BusinessRecord, OpeningHours, OrgSubType } from './types';
import { BUSINESS_CATEGORY_LABELS } from './map/constants';

type DayKey = keyof OpeningHours;

/** JS getDay() order: 0 = Sunday. */
const DAY_KEYS: DayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const DAY_SHORT: Record<DayKey, string> = {
  monday: 'Mo',
  tuesday: 'Di',
  wednesday: 'Mi',
  thursday: 'Do',
  friday: 'Fr',
  saturday: 'Sa',
  sunday: 'So',
};

/** Monday-first list for the opening-hours table. */
export const WEEK_DAYS: { key: DayKey; label: string }[] = [
  { key: 'monday', label: 'Montag' },
  { key: 'tuesday', label: 'Dienstag' },
  { key: 'wednesday', label: 'Mittwoch' },
  { key: 'thursday', label: 'Donnerstag' },
  { key: 'friday', label: 'Freitag' },
  { key: 'saturday', label: 'Samstag' },
  { key: 'sunday', label: 'Sonntag' },
];

export function todayKey(now = new Date()): DayKey {
  return DAY_KEYS[now.getDay()];
}

function hhmm(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export type OpenState = {
  isOpen: boolean;
  /** "Geöffnet" / "Geschlossen" — the colored half of the line. */
  label: string;
  /** "schließt um 18:00" / "öffnet morgen um 10:00" — may be empty. */
  detail: string;
};

/**
 * Open/closed line for the org header ("Geschlossen – öffnet um 10:00").
 * Unlike isRestaurantOpen() this also finds the next opening after today's
 * closing time, and handles hours that run past midnight.
 */
export function describeOpenState(hours: OpeningHours | null, now = new Date()): OpenState | null {
  if (!hours) return null;
  const hasAnyDay = DAY_KEYS.some((k) => hours[k] && !hours[k]!.closed);
  if (!hasAnyDay) return null;

  const t = hhmm(now);
  const dayIdx = now.getDay();
  const today = hours[DAY_KEYS[dayIdx]];
  const yesterday = hours[DAY_KEYS[(dayIdx + 6) % 7]];

  // Yesterday's hours spilling past midnight (e.g. 18:00 – 02:00).
  if (yesterday && !yesterday.closed && yesterday.close <= yesterday.open && t < yesterday.close) {
    return { isOpen: true, label: 'Geöffnet', detail: `schließt um ${yesterday.close}` };
  }

  if (today && !today.closed) {
    const overnight = today.close <= today.open;
    if (t >= today.open && (overnight || t < today.close)) {
      return { isOpen: true, label: 'Geöffnet', detail: `schließt um ${today.close}` };
    }
    if (t < today.open) {
      return { isOpen: false, label: 'Geschlossen', detail: `öffnet um ${today.open}` };
    }
  }

  for (let i = 1; i <= 7; i++) {
    const key = DAY_KEYS[(dayIdx + i) % 7];
    const day = hours[key];
    if (day && !day.closed) {
      const when = i === 1 ? 'morgen' : DAY_SHORT[key];
      return { isOpen: false, label: 'Geschlossen', detail: `öffnet ${when} um ${day.open}` };
    }
  }
  return { isOpen: false, label: 'Geschlossen', detail: '' };
}

/** German decimal comma: 4.5 → "4,5". */
/** "4,7"; '' when there is no average yet (the RPC returns null for 0 ratings). */
export function formatRating(avg: number | null | undefined): string {
  if (typeof avg !== 'number' || !Number.isFinite(avg)) return '';
  return avg.toFixed(1).replace('.', ',');
}

const SUB_TYPE_CATEGORY: Record<OrgSubType, string> = {
  restaurant: 'Gastronomie',
  unternehmen: 'Unternehmen',
  verein: 'Verein',
  stadt: 'Stadt',
  fraktion: 'Fraktion',
  journalist: 'Journalismus',
};

/**
 * Category line under the org name. A linked business row carries a finer
 * category ("Gesundheit", "Handwerk"); otherwise fall back to the sub-type.
 */
export function orgCategoryLabel(
  account: Pick<Account, 'sub_type'>,
  business?: Pick<BusinessRecord, 'category'> | null
): string | null {
  if (business?.category && BUSINESS_CATEGORY_LABELS[business.category]) {
    return BUSINESS_CATEGORY_LABELS[business.category];
  }
  return account.sub_type ? SUB_TYPE_CATEGORY[account.sub_type] : null;
}

export function orgShareUrl(account: Pick<Account, 'id' | 'slug'>): string {
  return account.slug
    ? `https://www.roebel.app/app/orgs/${account.slug}`
    : `https://www.roebel.app/account/${account.id}`;
}

export function formatListingPrice(price: number | null | undefined, priceType: string): string {
  if (priceType === 'free') return 'Gratis';
  if (typeof price !== 'number' || !Number.isFinite(price)) return '';
  const formatted = price.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${formatted} €${priceType === 'negotiable' ? ' VB' : ''}`;
}

export const MEMBER_ROLE_LABELS: Record<'owner' | 'admin' | 'member', string> = {
  owner: 'Inhaber:in',
  admin: 'Admin',
  member: 'Team',
};

/**
 * Address as shown in the app: geocoder results end in ", Germany" /
 * ", Deutschland", which is noise for a town app.
 */
export function formatAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  return address.replace(/,\s*(Germany|Deutschland)\s*$/i, '').trim() || null;
}
