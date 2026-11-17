/**
 * Signed client for the credential routes (POST /api/credentials/{org,actions,me}). Built on
 * postSigned (lib/signed-request.ts): same signature queue, same passkey-session shortcut, and it
 * never throws (network failure = { ok: false, code: 'NETWORK_ERROR' }).
 */
import type { Hex } from 'viem';
import { CREDENTIALS_SCOPE, postSigned, type ApiResult, type CredentialAction, type SigningAccount } from '@/lib/signed-request';
import type {
  ActionPrepared,
  ActionSubmitted,
  ActionView,
  BatchPrepared,
  Holding,
  InvitationView,
  OrgListEntry,
  PersonRow,
  PersonSearchHit,
  PhoneAction,
  Presentation,
  PresentationCreated,
  PresentationResolved,
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

export const fetchMine = (a: SigningAccount) => credApi<InvitationView[]>(a, 'me', 'mine', {});

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

export const prepareRevocation = (a: SigningAccount, p: { accountId: string; invitationIds?: string[]; batchId?: string }) =>
  credApi<ActionPrepared>(a, 'org', 'revoke_prepare', p);

export const prepareDelegate = (a: SigningAccount, p: { accountId: string; typeId: Hex; delegate: string; allowed: boolean; label?: string }) =>
  credApi<ActionPrepared>(a, 'org', 'delegate_prepare', p);

export const prepareMembersPublic = (a: SigningAccount, p: { accountId: string; membersPublic: boolean }) =>
  credApi<ActionPrepared>(a, 'org', 'members_public_prepare', p);

export const fetchActions = (a: SigningAccount, accountId: string) => credApi<ActionView[]>(a, 'org', 'actions_list', { accountId });

// ── actions (the phone confirms) ─────────────────────────────────────────────

export const fetchAction = (a: SigningAccount, actionId: string) => credApi<PhoneAction>(a, 'actions', 'action_get', { actionId });

export const reportSubmitted = (a: SigningAccount, actionId: string, txHash: Hex | string) =>
  credApi<ActionSubmitted>(a, 'actions', 'action_submitted', { actionId, txHash });

export const cancelAction = (a: SigningAccount, actionId: string) => credApi<null>(a, 'actions', 'action_cancel', { actionId });
