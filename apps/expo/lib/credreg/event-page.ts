/**
 * The badge on the event page (spec 5.6b): what an attendee sees before and after, and the
 * organiser's count and primary button. Pure; the organiser labels are the web panel's
 * (apps/web/src/lib/credentials/event-panel.ts) through eventBadgeRow.
 */
import { eventBadgeRow, EVENT_BADGE_LABELS } from './org';
import type { EventBadgeGetResult, PublicEventBadge } from './types';

export const ATTENDEE_LABELS = {
  before: 'Das bekommst du, wenn du dabei bist',
  collected: 'Gesammelt',
  pending: 'Wird eingetragen',
  over: 'Vorbei',
  heading: 'Abzeichen für Teilnehmende',
} as const;

export const ORGANISER_LABELS = {
  ...EVENT_BADGE_LABELS,
  heading: 'Abzeichen für Teilnehmende',
  showQr: 'Abzeichen-QR zeigen',
  qrHint: 'Halte diesen Code an den Eingang. Wer ihn scannt, sammelt das Abzeichen.',
  collectedSuffix: 'gesammelt',
} as const;

export type AttendeeBadgeState = { label: string; state: 'before' | 'collected' | 'pending' | 'over' };

/**
 * null = no badge for this event. held wins (the stamp stays collected after the window);
 * pending = the person attended and the stamp is on its way; after the claim window: over.
 */
export function attendeeBadgeState(p: { badge: PublicEventBadge | null; held: boolean; pending: boolean; nowSec: number }): AttendeeBadgeState | null {
  if (!p.badge) return null;
  if (p.held) return { label: ATTENDEE_LABELS.collected, state: 'collected' };
  if (p.pending) return { label: ATTENDEE_LABELS.pending, state: 'pending' };
  if (p.nowSec > p.badge.claimEnd) return { label: ATTENDEE_LABELS.over, state: 'over' };
  return { label: ATTENDEE_LABELS.before, state: 'before' };
}

export function badgeCountLine(g: Pick<EventBadgeGetResult, 'attendees' | 'issued' | 'accepted'>): string {
  return `${g.attendees} Teilnehmende · ${g.issued} eingeladen · ${g.accepted} angenommen`;
}

/** The organiser block: count line and primary button (same labels as the web panel). */
export function organiserBadgeView(g: EventBadgeGetResult): { count: string; primary: { label: string; disabled: boolean } } {
  const row = eventBadgeRow(g)!;
  return { count: badgeCountLine(g), primary: { label: row.label, disabled: row.disabled } };
}

// ── create/edit toggle ("Abzeichen für Teilnehmende") ─────────────────────────

/** artUrl null = the event poster. limit "" = no limit. */
export type BadgeSetupForm = { enabled: boolean; name: string; artUrl: string | null; limit: string };

export const SETUP_LABELS = {
  heading: 'Abzeichen für Teilnehmende',
  help: 'Wer dabei ist, sammelt mit dem Code am Eingang ein Abzeichen.',
  name: 'Name des Abzeichens',
  art: 'Bild',
  artPoster: 'Plakat der Veranstaltung',
  artChange: 'Bild ändern',
  artUsePoster: 'Plakat verwenden',
  limit: 'Höchstens (optional)',
  limitPlaceholder: 'Unbegrenzt',
  saveFailed: 'Das Abzeichen konnte nicht gespeichert werden. Du kannst es später auf der Veranstaltungsseite einrichten.',
} as const;

const NAME_MAX = 60;
export const defaultBadgeName = (title: string) => `Dabei: ${title.trim()}`.slice(0, NAME_MAX);

/** The event_badge_setup payload for the form, or the German reason it cannot be sent. */
export function badgeSetupPayload(
  f: BadgeSetupForm,
  ev: { eventId: string; title: string; posterUrl: string | null },
): { ok: true; payload: { eventId: string; enabled: boolean; name?: string; imageUrl?: string; supplyCap?: number } } | { ok: false; message: string } {
  if (!f.enabled) return { ok: true, payload: { eventId: ev.eventId, enabled: false } };
  const limit = f.limit.trim();
  let supplyCap: number | undefined;
  if (limit) {
    const n = Number(limit);
    if (!/^\d+$/.test(limit) || n < 1 || n > 100000) return { ok: false, message: 'Die Anzahl muss eine ganze Zahl zwischen 1 und 100000 sein.' };
    supplyCap = n;
  }
  const name = f.name.trim().slice(0, NAME_MAX) || defaultBadgeName(ev.title);
  const imageUrl = f.artUrl ?? ev.posterUrl ?? undefined;
  return {
    ok: true,
    payload: { eventId: ev.eventId, enabled: true, name, ...(imageUrl ? { imageUrl } : {}), ...(supplyCap ? { supplyCap } : {}) },
  };
}
