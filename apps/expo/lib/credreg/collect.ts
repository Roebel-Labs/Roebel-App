/**
 * Collecting at the door (spec 5.6b): the Smart Event QR (`roebel.app/e/<id>`) is the badge QR.
 * One scan claims the Röbel Münzen for attending (claim-reward, server-paid, unchanged) and that
 * claim records the attendance the badge is issued from. This file turns the claim answer into
 * the screen state and its copy; the screen (app/e/[id].tsx) only renders.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { claimReward, rewardAmountToMuenzen, type ClaimResult, type RewardAction } from '@/lib/rewards-claim';
import { supabase } from '@/lib/supabase';
import { fetchPublicEventBadge } from './api';
import { enqueueCollect, isNetworkFailure } from './collect-queue';
import { isCredentialsAllowed } from './gate';
import type { PublicEventBadge } from './types';

export type BadgeInfo = { eventId: string; eventTitle: string; eventDate: string; name: string; imageUrl: string | null };

export type CollectState =
  | { kind: 'working' }
  | { kind: 'collected'; muenzen: number | null; badge: BadgeInfo | null; pending: boolean }
  | { kind: 'already'; badge: BadgeInfo | null }
  | { kind: 'not_started' }
  | { kind: 'ended' }
  | { kind: 'budget_reached' }
  | { kind: 'invalid' }
  | { kind: 'queued'; badge: BadgeInfo | null }
  | { kind: 'signed_out' }
  | { kind: 'error'; message: string };

export type MomentAction = 'ansehen' | 'teilen' | 'weiter' | 'anmelden' | 'erneut';

export const MOMENT_ACTION_LABELS: Record<MomentAction, string> = {
  ansehen: 'Ansehen',
  teilen: 'Teilen',
  weiter: 'Weiter',
  anmelden: 'Anmelden',
  erneut: 'Erneut versuchen',
};

export const VISIBILITY_ROW = {
  label: 'Im Profil öffentlich zeigen',
  help: 'Aus: nur du siehst dieses Abzeichen.',
} as const;

const GENERIC_ERROR = 'Etwas ist schiefgelaufen. Versuch es später erneut.';

/** The claim answer → screen state (claim-reward's event_attend reasons). */
export function stateFromClaim(r: ClaimResult, badge: BadgeInfo | null): CollectState {
  switch (r.status) {
    case 'paid':
      // The badge itself still needs the organiser's (or node's) batch: it "wird eingetragen".
      return { kind: 'collected', muenzen: rewardAmountToMuenzen(r.amountAtto), badge, pending: badge !== null };
    case 'already_claimed':
      return { kind: 'already', badge };
    case 'rejected':
      if (r.reason === 'event not started') return { kind: 'not_started' };
      if (r.reason === 'event ended') return { kind: 'ended' };
      if (r.reason === 'event reward budget reached') return { kind: 'budget_reached' };
      return { kind: 'invalid' };
    default:
      return { kind: 'error', message: r.reason || GENERIC_ERROR };
  }
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** "2026-12-05" → "5. Dezember 2026"; anything else unchanged. */
export function formatEventDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!m) return date ?? '';
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])}. ${month} ${m[1]}` : date;
}

const badgeLines = (b: BadgeInfo | null) => (b ? [b.eventTitle, formatEventDate(b.eventDate)].filter(Boolean) : []);
const muenzenLine = (n: number | null) => (n !== null && n > 0 ? [`+${n} Röbel Münzen`] : []);

export type Moment = {
  headline: string;
  lines: string[];
  tone: 'success' | 'info' | 'warning';
  stampState: 'collected' | 'pending' | 'queued' | null;
  actions: MomentAction[];
};

export function momentFor(s: CollectState): Moment {
  switch (s.kind) {
    case 'working':
      return { headline: 'Wird gesammelt…', lines: [], tone: 'info', stampState: null, actions: [] };
    case 'collected':
      if (s.badge) {
        return {
          headline: 'Abzeichen erhalten',
          lines: [...badgeLines(s.badge), ...muenzenLine(s.muenzen), ...(s.pending ? ['Wird in dein Profil eingetragen.'] : [])],
          tone: 'success',
          stampState: s.pending ? 'pending' : 'collected',
          actions: ['ansehen', 'teilen', 'weiter'],
        };
      }
      // Today's Münzen text (events without a badge).
      return {
        headline: 'Danke fürs Dabeisein!',
        lines: ['Du hast ein paar Röbel Münzen als Beleg erhalten.', ...muenzenLine(s.muenzen)],
        tone: 'success',
        stampState: null,
        actions: ['weiter'],
      };
    case 'already':
      return {
        headline: 'Schon gesammelt',
        lines: s.badge ? badgeLines(s.badge) : ['Du hast diesen Event-Beleg bereits erhalten.'],
        tone: 'info',
        stampState: s.badge ? 'collected' : null,
        actions: s.badge ? ['ansehen', 'weiter'] : ['weiter'],
      };
    case 'not_started':
      return { headline: 'Noch nicht gestartet', lines: ['Komm zum Beginn der Veranstaltung wieder.'], tone: 'warning', stampState: null, actions: ['weiter'] };
    case 'ended':
      return { headline: 'Vorbei', lines: ['Diese Veranstaltung ist zu Ende.'], tone: 'warning', stampState: null, actions: ['weiter'] };
    case 'budget_reached':
      return {
        headline: 'Alle Belege vergeben',
        lines: ['Für dieses Event sind alle Belege vergeben. Schade — beim nächsten Mal bist du dabei!'],
        tone: 'warning',
        stampState: null,
        actions: ['weiter'],
      };
    case 'invalid':
      return { headline: 'Dieser Code ist nicht gültig.', lines: [], tone: 'warning', stampState: null, actions: ['weiter'] };
    case 'queued':
      return {
        headline: 'Gleich gesammelt',
        lines: [
          s.badge
            ? 'Du bist offline. Wir sammeln dein Abzeichen, sobald du wieder online bist.'
            : 'Du bist offline. Wir sammeln deinen Beleg, sobald du wieder online bist.',
        ],
        tone: 'info',
        stampState: 'queued',
        actions: ['weiter'],
      };
    case 'signed_out':
      return { headline: 'Bitte zuerst anmelden.', lines: [], tone: 'info', stampState: null, actions: ['anmelden'] };
    case 'error':
      return { headline: 'Das hat nicht geklappt', lines: [s.message || GENERIC_ERROR], tone: 'warning', stampState: null, actions: ['erneut', 'weiter'] };
  }
}

/** Where "Ansehen" goes: the badge's sheet in the profile collection. */
export const badgeHref = (b: BadgeInfo) => `/profile?badge=${encodeURIComponent(b.eventId)}`;

/** "Teilen": the post composer with the event linked and the text prefilled. */
export function shareRoute(b: BadgeInfo) {
  return {
    pathname: '/create',
    params: { linkedEventId: b.eventId, linkedEventTitle: b.eventTitle, linkedEventDate: b.eventDate, initialText: `Ich war dabei: ${b.eventTitle}` },
  } as const;
}

// ── scan ──────────────────────────────────────────────────────────────────────

export type ScanDeps = {
  claim: (wallet: string, action: RewardAction, referenceId?: string) => Promise<ClaimResult>;
  /** false = known offline (NetInfo); the scan is queued without trying. */
  online: () => Promise<boolean>;
};

/**
 * The claim for an already-onboarded scanner. No connection (known up front, or a network failure
 * on the way) → the scan is queued once and the moment says "Gleich gesammelt".
 */
export async function scanOutcome(address: string, rewardEventId: string, badge: BadgeInfo | null, deps: ScanDeps): Promise<CollectState> {
  const online = await deps.online().catch(() => true);
  if (!online) {
    await enqueueCollect(address, rewardEventId);
    return { kind: 'queued', badge };
  }
  const r = await deps.claim(address, 'event_attend', rewardEventId);
  if (isNetworkFailure(r)) {
    await enqueueCollect(address, rewardEventId);
    return { kind: 'queued', badge };
  }
  return stateFromClaim(r, badge);
}

export const defaultScanDeps = (online: () => Promise<boolean>): ScanDeps => ({ claim: claimReward, online });

// ── gate at the door ──────────────────────────────────────────────────────────

const GATE_KEY = 'credreg:gate-last:v1';

/**
 * The credentials gate for a scan. Online it is read fresh and remembered; offline (the flag
 * cannot be fetched) the last known answer decides, so the offline queue works at the door.
 */
export async function scanGate(deps: { online: () => Promise<boolean>; allowed: () => Promise<boolean> }): Promise<boolean> {
  const online = await deps.online().catch(() => true);
  if (!online) {
    try {
      return (await AsyncStorage.getItem(GATE_KEY)) === '1';
    } catch {
      return false;
    }
  }
  const allowed = await deps.allowed().catch(() => false);
  try {
    await AsyncStorage.setItem(GATE_KEY, allowed ? '1' : '0');
  } catch {
    // best effort
  }
  return allowed;
}

// ── the scanned event's badge ─────────────────────────────────────────────────

export type BadgeLookupDeps = {
  gateOpen: () => Promise<boolean>;
  eventIdFor: (rewardEventId: string) => Promise<string | null>;
  publicBadge: (eventId: string) => Promise<PublicEventBadge | null | undefined>;
  eventFor: (eventId: string) => Promise<{ title: string; date: string } | null>;
};

export const defaultBadgeLookup: BadgeLookupDeps = {
  gateOpen: () => isCredentialsAllowed(),
  async eventIdFor(rewardEventId) {
    const { data } = await supabase.from('reward_events').select('event_id').eq('id', rewardEventId).maybeSingle();
    return (data as { event_id: string | null } | null)?.event_id ?? null;
  },
  publicBadge: (eventId) => fetchPublicEventBadge(eventId),
  async eventFor(eventId) {
    const { data } = await supabase.from('events').select('title, date').eq('id', eventId).maybeSingle();
    const row = data as { title: string | null; date: string | null } | null;
    return row ? { title: row.title ?? '', date: row.date ?? '' } : null;
  },
};

/** The badge of the scanned event, or null (gate closed: nothing is asked at all). */
export async function badgeForScan(rewardEventId: string, deps: BadgeLookupDeps = defaultBadgeLookup): Promise<BadgeInfo | null> {
  try {
    if (!(await deps.gateOpen())) return null;
    const eventId = await deps.eventIdFor(rewardEventId);
    if (!eventId) return null;
    const [badge, event] = await Promise.all([deps.publicBadge(eventId), deps.eventFor(eventId)]);
    if (!badge) return null;
    return { eventId, eventTitle: event?.title ?? '', eventDate: event?.date ?? '', name: badge.name, imageUrl: badge.imageUrl };
  } catch {
    return null;
  }
}
