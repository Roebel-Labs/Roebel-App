/**
 * Signed client for the credential routes (POST /api/credentials/{org,actions,me}). Built on
 * postSigned (lib/signed-request.ts): same signature queue, same passkey-session shortcut, and it
 * never throws (network failure = { ok: false, code: 'NETWORK_ERROR' }).
 */
import type { Hex } from 'viem';
import { CREDENTIALS_SCOPE, getApiBaseUrl, postSigned, type ApiResult, type CredentialAction, type SigningAccount } from '@/lib/signed-request';
import type {
  ActionPrepared,
  ActionSubmitted,
  ActionView,
  BatchPrepared,
  EventBadgeGetResult,
  EventBadgePrepared,
  Holding,
  InvitationView,
  MineResult,
  OrgListEntry,
  PersonRow,
  PersonSearchHit,
  PhoneAction,
  Presentation,
  PresentationCreated,
  PresentationResolved,
  PublicEventBadge,
  RecipientInput,
  TypeView,
} from './types';

export type CredRoute = 'org' | 'actions' | 'me';

export async function credApi<T>(
  account: SigningAccount,
  route: CredRoute,
  action: CredentialAction,
  payload: Record<string, unknown>,
): Promise<ApiResult<T>> {
  try {
    return await postSigned<T>(`/api/credentials/${route}`, account, action, payload, CREDENTIALS_SCOPE);
  } catch (err) {
    // postSigned already maps its failures; this is a last guard so a screen never sees a throw.
    return { ok: false, code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Netzwerkfehler' };
  }
}

// ── holder ────────────────────────────────────────────────────────────────────

/** Reads both answers of `mine`: the older plain list and `{ invitations, pendingBadges }`. */
function asMine(data: unknown): MineResult {
  if (Array.isArray(data)) return { invitations: data as InvitationView[], pendingBadges: [] };
  const d = (data ?? {}) as Partial<MineResult>;
  return {
    invitations: Array.isArray(d.invitations) ? d.invitations : [],
    pendingBadges: Array.isArray(d.pendingBadges) ? d.pendingBadges : [],
  };
}

/** My invitations and the badges still waiting for the organiser. */
export async function fetchMineFull(a: SigningAccount): Promise<ApiResult<MineResult>> {
  const res = await credApi<unknown>(a, 'me', 'mine', {});
  return res.ok ? { ok: true, data: asMine(res.data) } : res;
}

/** My invitations only. */
export async function fetchMine(a: SigningAccount): Promise<ApiResult<InvitationView[]>> {
  const res = await fetchMineFull(a);
  return res.ok ? { ok: true, data: res.data.invitations } : res;
}

export const redeemInvitation = (a: SigningAccount, token: string) => credApi<InvitationView>(a, 'me', 'redeem', { token });

export const respondInvitation = (a: SigningAccount, invitationId: string, decision: 'accept' | 'decline') =>
  credApi<null>(a, 'me', 'respond', { invitationId, decision });

export const fetchHoldings = (a: SigningAccount, typeIds: Hex[]) => credApi<Holding[]>(a, 'me', 'holdings', { typeIds });

export const createPresentation = (a: SigningAccount, presentation: Presentation) =>
  credApi<PresentationCreated>(a, 'me', 'present_create', { presentation });

export const resolvePresentation = (a: SigningAccount, code: string) => credApi<PresentationResolved>(a, 'me', 'present_resolve', { code });

// ── org ───────────────────────────────────────────────────────────────────────

export const fetchOrgs = (a: SigningAccount) => credApi<OrgListEntry[]>(a, 'org', 'orgs_list', {});

export const fetchTypes = (a: SigningAccount, accountId: string) => credApi<TypeView[]>(a, 'org', 'types_list', { accountId });

export const fetchPeople = (a: SigningAccount, accountId: string, typeId: Hex) =>
  credApi<PersonRow[]>(a, 'org', 'people_list', { accountId, typeId });

export const searchPeople = (a: SigningAccount, accountId: string, query: string) =>
  credApi<PersonSearchHit[]>(a, 'org', 'people_search', { accountId, query });

export const prepareBatch = (
  a: SigningAccount,
  p: { accountId: string; typeId: Hex; recipients?: RecipientInput[]; fromMemberList?: boolean; validUntil?: string; source?: 'people' | 'member_list' | 'event' },
) => credApi<BatchPrepared>(a, 'org', 'batch_prepare', p);

/** "Für neues Jahr erneuern": every accepted, unrevoked holder of the type gets the new date. */
export const prepareRenewal = (a: SigningAccount, p: { accountId: string; renewTypeId: Hex; validUntil: string }) =>
  credApi<BatchPrepared>(a, 'org', 'batch_prepare', { ...p, typeId: p.renewTypeId });

/** "Neuer Ausweis-Typ" from a template (type_prepare op create). */
export const prepareTypeCreate = (
  a: SigningAccount,
  p: { accountId: string; op: 'create'; template: string; kind: string; name: string; description: string; benefits: string[]; supplyCap: number },
) => credApi<{ actionId: string | null }>(a, 'org', 'type_prepare', { ...p, client: 'app' });

export const prepareRevocation = (a: SigningAccount, p: { accountId: string; invitationIds?: string[]; batchId?: string }) =>
  credApi<ActionPrepared>(a, 'org', 'revoke_prepare', p);

export const prepareDelegate = (a: SigningAccount, p: { accountId: string; typeId: Hex; delegate: string; allowed: boolean; label?: string }) =>
  credApi<ActionPrepared>(a, 'org', 'delegate_prepare', p);

export const prepareMembersPublic = (a: SigningAccount, p: { accountId: string; membersPublic: boolean }) =>
  credApi<ActionPrepared>(a, 'org', 'members_public_prepare', p);

export const fetchActions = (a: SigningAccount, accountId: string) => credApi<ActionView[]>(a, 'org', 'actions_list', { accountId });

// ── event badges ──────────────────────────────────────────────────────────────

export const fetchEventBadge = (a: SigningAccount, eventId: string) => credApi<EventBadgeGetResult>(a, 'org', 'event_badge_get', { eventId });

export const prepareEventBadge = (a: SigningAccount, eventId: string) =>
  credApi<EventBadgePrepared>(a, 'org', 'event_badge_prepare', { eventId, client: 'app' });

/** Create/edit toggle: stores (or retires) the event's draft badge; no chain step (event_badge_setup). */
export const setupEventBadge = (
  a: SigningAccount,
  p: { eventId: string; enabled: boolean; name?: string; imageUrl?: string; supplyCap?: number },
) => credApi<{ typeId: Hex | null }>(a, 'org', 'event_badge_setup', { ...p, client: 'app' });

/** The event's Smart Event QR id (created on first use for a published event). */
export const ensureEventQr = (a: SigningAccount, eventId: string) => credApi<{ rewardEventId: string }>(a, 'org', 'event_badge_qr', { eventId });

/**
 * The event's badge as anyone may see it (no signature, no names). undefined when it could not
 * be read (network, timeout), null when the event has no badge. Never throws.
 */
export async function fetchPublicEventBadge(eventId: string, timeoutMs = 8000): Promise<PublicEventBadge | null | undefined> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/credentials/events/${encodeURIComponent(eventId)}/badge`, { signal: ctl.signal });
    if (res.status !== 200) return undefined;
    const json = (await res.json()) as { badge?: PublicEventBadge | null };
    return json?.badge ?? null;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

// ── actions (the phone confirms) ─────────────────────────────────────────────

export const fetchAction = (a: SigningAccount, actionId: string) => credApi<PhoneAction>(a, 'actions', 'action_get', { actionId });

export const reportSubmitted = (a: SigningAccount, actionId: string, txHash: Hex | string) =>
  credApi<ActionSubmitted>(a, 'actions', 'action_submitted', { actionId, txHash });

export const cancelAction = (a: SigningAccount, actionId: string) => credApi<null>(a, 'actions', 'action_cancel', { actionId });
