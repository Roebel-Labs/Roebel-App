/**
 * Credential register — the pure model: what a person holds (register data) → profile cards and
 * badges. No React, no network, no storage.
 */
import { RESERVED_TYPE_IDS } from '@netizen-labs/credential-registry';
import type { Hex } from 'viem';
import { CREDENTIAL_COPY, credentialKindsFor, type CredentialKind } from '@/lib/credentials';
import type { HeldCredential } from './held';

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

function registerCard(h: HeldCredential, nowSec: number): RegisterCard | null {
  if (RESERVED.has(h.typeId.toLowerCase())) return null;
  const expired = h.validUntil !== null && h.validUntil < nowSec;
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
