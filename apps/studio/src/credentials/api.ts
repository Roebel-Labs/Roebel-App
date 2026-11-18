// Credential register client for the "Ausweise" section (plan credreg-5). Studio holds no key: it
// calls the same routes as the browser dashboard with the paired chat session token, and every change
// becomes a prepared action that a phone confirms (plan 2 Task 4). Holder actions are app-only (403).
import { t } from '../i18n';
import { apiBase } from '../workspace/session';
import type {
  ActionView,
  CredentialsStatus,
  DelegatesData,
  EventBadgeListItem,
  OrgListItem,
  PeopleInput,
  PersonRow,
  PreviewResult,
  TypePreparePayload,
  TypeRow,
} from './types';

export class CredentialsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type CredRoute = 'org' | 'actions' | 'me';

/** True for an error that means "pair this device again" (the sign-in prompt is shown). */
export const isSessionError = (e: unknown): boolean => e instanceof CredentialsApiError && e.code === 'session';

async function failure(res: Response): Promise<CredentialsApiError> {
  const j = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (res.status === 401) return new CredentialsApiError(401, 'session', t('Deine Anmeldung ist abgelaufen. Melde dich unter Start neu an.'));
  if (res.status === 403 && j?.code === 'APP_ONLY') return new CredentialsApiError(403, 'APP_ONLY', t('Das geht nur in der Röbel App.'));
  // Server messages are German product text (plan 2) and are shown as they are.
  return new CredentialsApiError(res.status, j?.code ?? 'failed', j?.message ?? t('Fehler {status}', { status: res.status }));
}

async function post(route: CredRoute, action: string, payload: Record<string, unknown>, token: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/credentials/${route}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      // `client: 'studio'` lets the server record the action as prepared in Studio (viaOf).
      body: JSON.stringify({ action, payload: { ...payload, client: 'studio' } }),
    });
  } catch {
    throw new CredentialsApiError(0, 'network', t('Server nicht erreichbar. Internetverbindung prüfen.'));
  }
  if (!res.ok) throw await failure(res);
  return res;
}

/** POST /api/credentials/<route> with { action, payload }; returns the `data` of { ok: true, data }. */
export async function credCall<T>(route: CredRoute, action: string, payload: Record<string, unknown>, token: string): Promise<T> {
  const res = await post(route, action, payload, token);
  const j = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; code?: string; message?: string } | null;
  if (!j || j.ok === false) throw new CredentialsApiError(res.status, j?.code ?? 'failed', j?.message ?? t('Unerwartete Antwort vom Server.'));
  return j.data as T;
}

// ---- status and orgs ----------------------------------------------------------------

/** Public switch of the register (plan 4 Task 1). Anything but a clear answer counts as off. */
export async function fetchStatus(): Promise<CredentialsStatus> {
  try {
    const res = await fetch(`${apiBase()}/api/credentials/status`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { enabled: false, configured: false };
    const j = (await res.json()) as Partial<CredentialsStatus> & { data?: Partial<CredentialsStatus> };
    const s = j.data ?? j;
    return { enabled: s.enabled === true, configured: s.configured === true };
  } catch {
    return { enabled: false, configured: false };
  }
}

/** The rail entry exists only when the register is on and the user manages at least one org. */
export function credentialsVisible(status: CredentialsStatus | null, orgs: OrgListItem[] | null): boolean {
  return !!status?.enabled && !!orgs && orgs.length > 0;
}

export const fetchOrgs = (token: string) => credCall<OrgListItem[]>('org', 'orgs_list', {}, token);

// ---- types --------------------------------------------------------------------------

export const fetchTypes = (token: string, accountId: string) => credCall<TypeRow[]>('org', 'types_list', { accountId }, token);

export const prepareType = (token: string, p: TypePreparePayload) =>
  credCall<{ actionId: string; typeId: string }>('org', 'type_prepare', { ...p }, token);

// ---- people and batches -------------------------------------------------------------

export const previewPeople = (token: string, p: PeopleInput) => credCall<PreviewResult>('org', 'people_preview', { ...p }, token);

export const prepareBatch = (token: string, p: PeopleInput) =>
  credCall<{ actionId: string; batchId: string; counts: { app: number; link: number; skipped: number } }>('org', 'batch_prepare', { ...p, source: p.fromMemberList ? 'member_list' : 'people' }, token);

export const fetchPeople = (token: string, accountId: string, typeId: string) => credCall<PersonRow[]>('org', 'people_list', { accountId, typeId }, token);

export const prepareRevocation = (token: string, p: { accountId: string; invitationIds?: string[]; batchId?: string }) =>
  credCall<{ actionId: string }>('org', 'revoke_prepare', { ...p }, token);

/** The printable letters of a batch (personal links as QR codes), as a PDF. */
export async function downloadLetters(token: string, accountId: string, batchId: string): Promise<Blob> {
  const res = await post('org', 'letters', { accountId, batchId }, token);
  return res.blob();
}

// ---- actions ------------------------------------------------------------------------

export const fetchActions = (token: string, accountId: string) => credCall<ActionView[]>('org', 'actions_list', { accountId }, token);

export const cancelAction = (token: string, actionId: string) => credCall<null>('actions', 'action_cancel', { actionId }, token);

// ---- event badges, delegates, members switch ------------------------------------------

export const fetchEventBadges = (token: string, accountId: string) => credCall<EventBadgeListItem[]>('org', 'event_badges_list', { accountId }, token);

export const prepareEventBadge = (token: string, eventId: string, p: { name?: string; imageUrl?: string } = {}) =>
  credCall<{ actionId: string; typeId: string; count: number }>('org', 'event_badge_prepare', { eventId, ...p }, token);

export const setEventBadgeAuto = (token: string, eventId: string, enabled: boolean) =>
  credCall<{ actionId: string }>('org', 'event_badge_auto', { eventId, enabled }, token);

export const fetchDelegates = (token: string, accountId: string) => credCall<DelegatesData>('org', 'delegates_list', { accountId }, token);

export const prepareDelegate = (token: string, p: { accountId: string; typeId: string; delegate: string; allowed: boolean; label?: string }) =>
  credCall<{ actionId: string }>('org', 'delegate_prepare', { ...p }, token);

export const prepareMembersPublic = (token: string, accountId: string, membersPublic: boolean) =>
  credCall<{ actionId: string }>('org', 'members_public_prepare', { accountId, membersPublic }, token);
