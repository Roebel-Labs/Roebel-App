/**
 * Waiting stamps (spec 5.6b / 5.3): the person's public/private wish for a badge, remembered on
 * the device from the stamp moment until the organiser's batch arrives; then the arrived badge is
 * accepted by that wish, and a public one is claimed inside the next sponsored operation the
 * account sends anyway (guest.ts sendWithPiggyback) or from the collection banner. Never a
 * fingerprint prompt the person did not start. Never logs (keys hold an address).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ApiResult, SigningAccount } from '@/lib/signed-request';
import type { Account } from 'thirdweb/wallets';
import type { Call } from '@/lib/org-safe/ops';
import { respondInvitation } from './api';
import { claimFor } from './claim-call';
import type { InvitationView } from './types';

export type BadgeWish = 'public' | 'private';

export const badgeWishKey = (address: string, eventId: string) => `credreg:badge-wish:v1:${address.toLowerCase()}:${eventId}`;

export async function setBadgeWish(address: string, eventId: string, wish: BadgeWish): Promise<void> {
  try {
    await AsyncStorage.setItem(badgeWishKey(address, eventId), wish);
  } catch {
    // best effort: without a wish the normal accept screen asks
  }
}

export async function getBadgeWish(address: string, eventId: string): Promise<BadgeWish | null> {
  try {
    const v = await AsyncStorage.getItem(badgeWishKey(address, eventId));
    return v === 'public' || v === 'private' ? v : null;
  } catch {
    return null;
  }
}

// ── arrived badges ───────────────────────────────────────────────────────────

type RespondFn = (a: SigningAccount, invitationId: string, decision: 'accept' | 'decline') => Promise<ApiResult<null>>;

export type SettleDeps = {
  respond: RespondFn;
  getWish: (address: string, eventId: string) => Promise<BadgeWish | null>;
};

const isBadgeWithEvent = (i: InvitationView): i is InvitationView & { type: { eventId: string } } =>
  i.type.kind === 'badge' && typeof i.type.eventId === 'string' && i.type.eventId.length > 0;

/**
 * Badge invitations that arrived for an event the person collected at the door: the stored wish
 * answers for them. `private` → accepted, no transaction; `public` → accepted and ready to be
 * claimed inside the next sponsored operation. Without a wish the normal accept screen asks.
 */
export async function settleArrivedBadges(
  account: { address: string },
  invitations: readonly InvitationView[],
  deps: Partial<SettleDeps> = {},
): Promise<{ acceptedPrivately: number; ready: InvitationView[] }> {
  const d: SettleDeps = { respond: respondInvitation, getWish: getBadgeWish, ...deps };
  let acceptedPrivately = 0;
  const ready: InvitationView[] = [];
  for (const inv of invitations) {
    if (inv.state !== 'invited' || !isBadgeWithEvent(inv)) continue;
    const wish = await d.getWish(account.address, inv.type.eventId);
    if (!wish) continue;
    let res: ApiResult<null>;
    try {
      res = await d.respond(account as unknown as SigningAccount, inv.id, 'accept');
    } catch {
      continue;
    }
    if (!res.ok) continue;
    if (wish === 'private') acceptedPrivately++;
    else ready.push({ ...inv, state: 'accepted' });
  }
  return { acceptedPrivately, ready };
}

// ── claims that ride along ───────────────────────────────────────────────────

export const MAX_PIGGYBACK_CLAIMS = 5;

/**
 * Accepted badge invitations not yet held on chain, per address (set by loadHolder after each
 * `mine` + holdsMany). In memory only: claim data is never stored on the device.
 */
const readyByAddress = new Map<string, InvitationView[]>();

export function rememberReady(address: string, invitations: readonly InvitationView[]): void {
  readyByAddress.set(address.toLowerCase(), [...invitations]);
}

export function rememberedReady(address: string): InvitationView[] {
  return readyByAddress.get(address.toLowerCase()) ?? [];
}

/** Claim calls for accepted badges with the wish `public`, not yet held, at most five. */
export async function readyClaimCalls(
  address: string,
  deps: { ready?: (address: string) => InvitationView[]; getWish?: SettleDeps['getWish'] } = {},
): Promise<Call[]> {
  const ready = (deps.ready ?? rememberedReady)(address);
  const getWish = deps.getWish ?? getBadgeWish;
  const me = address.toLowerCase();
  const calls: Call[] = [];
  for (const inv of ready) {
    if (calls.length >= MAX_PIGGYBACK_CLAIMS) break;
    if (inv.state !== 'accepted' || !isBadgeWithEvent(inv)) continue;
    // An account leaf names its account: from any other one the claim could only revert.
    if (inv.claim?.leaf?.kind === 'account' && inv.claim.leaf.subject.toLowerCase() !== me) continue;
    if ((await getWish(address, inv.type.eventId)) !== 'public') continue;
    const call = claimFor(inv);
    if (call) calls.push(call);
  }
  return calls;
}

/**
 * The collection banner "<n> Abzeichen bereit · Jetzt eintragen": the ready claims alone, one
 * operation (one fingerprint the person started). Returns how many were sent; throws the send
 * error unchanged (the banner shows it).
 */
export async function sendReadyClaims(
  account: Account,
  deps: { send?: (account: Account, calls: readonly Call[]) => Promise<unknown> } = {},
): Promise<number> {
  const calls = await readyClaimCalls(account.address);
  if (calls.length === 0) return 0;
  // Loaded on use: the send module pulls the thirdweb contracts, which the profile's held list
  // (which imports this file) must not load at start.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const send = deps.send ?? (require('@/lib/org-safe/send') as typeof import('@/lib/org-safe/send')).sendOrgCalls;
  await send(account, calls);
  return calls.length;
}
