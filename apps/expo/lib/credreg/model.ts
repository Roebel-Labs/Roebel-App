/**
 * Credential register — the pure model: what a person holds (register data) → profile cards and
 * badges. No React, no network, no storage.
 */
import { RESERVED_TYPE_IDS } from '@netizen-labs/credential-registry';
import type { Hex } from 'viem';
import type { CardDesign } from '@roebel/card-design';
import { CREDENTIAL_COPY, credentialKindsFor, type CredentialKind } from '@/lib/credentials';
import type { HeldCredential } from './held';
import type { PendingBadge } from './types';

export type RegisterCard = {
  key: string; // 'builtin:citizen' or typeId
  source: 'builtin' | 'register';
  builtin?: CredentialKind; // guest | citizen | attester
  typeId?: Hex;
  kind: 'role' | 'membership' | 'badge';
  title: string;
  orgName: string | null;
  imageUrl: string | null;
  recognised: boolean;
  visibility: 'public' | 'private';
  validUntil: number | null; // unix seconds
  state: 'valid' | 'expired';
  invitationId?: string;
  benefits?: string[];
  /** false = the org shows its members only privately. */
  publicAllowed?: boolean;
  /** Event badges: the event's id, title and day ("YYYY-MM-DD"). */
  eventId?: string;
  eventTitle?: string;
  eventDate?: string;
  /** Drawn with Skia on the holder's device when present; otherwise `imageUrl` as before. */
  design?: CardDesign;
};

export type Profile = { cards: RegisterCard[]; badges: RegisterCard[] };

/** An expired entry stays visible (as expired) this long after its validUntil, then drops out. */
export const EXPIRED_GRACE_SEC = 30 * 86_400;

/** The reserved community types are shown by the built-in cards, never as register cards. */
const RESERVED = new Set(Object.values(RESERVED_TYPE_IDS).map((id) => id.toLowerCase()));

const byTitle = (a: RegisterCard, b: RegisterCard) => a.title.localeCompare(b.title, 'de');

function builtinCard(kind: CredentialKind): RegisterCard {
  return {
    key: `builtin:${kind}`,
    source: 'builtin',
    builtin: kind,
    kind: 'role',
    title: CREDENTIAL_COPY[kind].title,
    orgName: null,
    imageUrl: null,
    recognised: true,
    visibility: 'public',
    validUntil: null,
    state: 'valid',
  };
}

/** Expired now? Screens use this (or RegisterCard.state) to hide make-private / renounce. */
export function isExpired(h: Pick<HeldCredential, 'validUntil'>, nowSec: number): boolean {
  return h.validUntil !== null && h.validUntil < nowSec;
}

function registerCard(h: HeldCredential, nowSec: number): RegisterCard | null {
  if (RESERVED.has(h.typeId.toLowerCase())) return null;
  const expired = isExpired(h, nowSec);
  if (expired && nowSec - (h.validUntil as number) > EXPIRED_GRACE_SEC) return null;
  const card: RegisterCard = {
    key: h.typeId,
    source: 'register',
    typeId: h.typeId,
    kind: h.kind,
    title: h.title,
    orgName: h.orgName,
    imageUrl: h.imageUrl,
    recognised: h.recognised,
    visibility: h.visibility,
    validUntil: h.validUntil,
    state: expired ? 'expired' : 'valid',
  };
  if (h.invitationId) card.invitationId = h.invitationId;
  if (h.benefits) card.benefits = h.benefits;
  if (typeof h.publicAllowed === 'boolean') card.publicAllowed = h.publicAllowed;
  if (h.eventId) card.eventId = h.eventId;
  if (h.eventTitle) card.eventTitle = h.eventTitle;
  if (h.eventDate) card.eventDate = h.eventDate;
  if (h.design) card.design = h.design;
  return card;
}

/**
 * Cards: the built-in cards exactly as today (`credentialKindsFor`), then recognised roles, other
 * roles, memberships, each group by title. Badges: newest first — `held` arrives in the server's
 * `mine` order (oldest invitation first), so badges are that order reversed.
 */
export function buildProfile(input: { isCitizen: boolean; isAttester: boolean; held: HeldCredential[]; nowSec: number }): Profile {
  const builtins = credentialKindsFor(input).map(builtinCard);
  const entries = input.held.map((h) => registerCard(h, input.nowSec)).filter((c): c is RegisterCard => c !== null);
  const recognisedRoles = entries.filter((c) => c.kind === 'role' && c.recognised).sort(byTitle);
  const otherRoles = entries.filter((c) => c.kind === 'role' && !c.recognised).sort(byTitle);
  const memberships = entries.filter((c) => c.kind === 'membership').sort(byTitle);
  const badges = entries.filter((c) => c.kind === 'badge').reverse();
  return { cards: [...builtins, ...recognisedRoles, ...otherRoles, ...memberships], badges };
}

/** Another person's profile: public entries only, and no invitation ids leave this function. */
export function publicProfile(input: { isCitizen: boolean; isAttester: boolean; publicHeld: HeldCredential[]; nowSec: number }): Profile {
  const held = input.publicHeld.filter((h) => h.visibility === 'public').map((h) => ({ ...h, invitationId: null, claim: null }));
  return buildProfile({ isCitizen: input.isCitizen, isAttester: input.isAttester, held, nowSec: input.nowSec });
}

// ── the "Abzeichen" collection ───────────────────────────────────────────────

export type BadgeTile = {
  key: string;
  title: string;
  eventTitle: string | null;
  date: string | null;
  imageUrl: string | null;
  /** collected = held; pending = attended, the organiser has not issued it yet; queued = scanned offline. */
  state: 'collected' | 'pending' | 'queued';
  visibility: 'public' | 'private' | null;
  card: RegisterCard | null;
  /** The event (collected and pending tiles); "Ansehen" from the stamp moment finds the tile by it. */
  eventId: string | null;
  orgName: string | null;
};

const yearOf = (date: string | null): number | null => {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(date ?? '');
  return m ? Number(m[1]) : null;
};

/**
 * Badges by year, newest year first and newest first inside a year. Year from the event day; a
 * badge without one (no event, or a scan still queued offline) belongs to the current year and
 * comes first in it. A waiting badge whose event is already held is not listed twice.
 * `queued`: the ids of scans waiting in the offline queue.
 */
export function groupBadgesByYear(
  badges: RegisterCard[],
  pending: PendingBadge[],
  queued: string[],
  nowSec: number = Math.floor(Date.now() / 1000),
): { year: number; items: BadgeTile[] }[] {
  const heldEvents = new Set(badges.map((b) => b.eventId).filter(Boolean));
  const tiles: BadgeTile[] = [
    ...queued.map((id): BadgeTile => ({
      key: `queued:${id}`, title: 'Abzeichen', eventTitle: null, date: null, imageUrl: null, state: 'queued', visibility: null, card: null, eventId: null, orgName: null,
    })),
    ...badges.map((c): BadgeTile => ({
      key: c.key, title: c.title, eventTitle: c.eventTitle ?? null, date: c.eventDate ?? null, imageUrl: c.imageUrl, state: 'collected', visibility: c.visibility,
      card: c, eventId: c.eventId ?? null, orgName: c.orgName,
    })),
    ...pending
      .filter((p) => !heldEvents.has(p.eventId))
      .map((p): BadgeTile => ({
        key: `pending:${p.eventId}`, title: p.name, eventTitle: p.eventTitle, date: p.eventDate, imageUrl: p.imageUrl, state: 'pending', visibility: null,
        card: null, eventId: p.eventId, orgName: p.orgName,
      })),
  ];
  const current = new Date(nowSec * 1000).getUTCFullYear();
  const groups = new Map<number, { tile: BadgeTile; order: number }[]>();
  tiles.forEach((tile, order) => {
    const year = yearOf(tile.date) ?? current;
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year)!.push({ tile, order });
  });
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, entries]) => ({
      year,
      items: entries
        .sort((a, b) => {
          // Undated first, then by day (newest first), then the list's own order (newest first already).
          if (!a.tile.date !== !b.tile.date) return a.tile.date ? 1 : -1;
          if (a.tile.date && b.tile.date && a.tile.date !== b.tile.date) return b.tile.date.localeCompare(a.tile.date);
          return a.order - b.order;
        })
        .map((e) => e.tile),
    }));
}

/** The tile of an event (`/profile?badge=<eventId>`), or null. */
export function badgeTileForEvent(groups: { items: BadgeTile[] }[], eventId: string | null | undefined): BadgeTile | null {
  if (!eventId) return null;
  for (const g of groups) for (const t of g.items) if (t.eventId === eventId) return t;
  return null;
}
