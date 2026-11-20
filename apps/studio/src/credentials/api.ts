// Credential register client for the "Ausweise" section (plan credreg-5). Studio holds no key: it
// calls the same routes as the browser dashboard with the paired chat session token, and every change
// becomes a prepared action that a phone confirms (plan 2 Task 4). Holder actions are app-only (403).
import { t } from '../i18n';
import { apiBase } from '../workspace/session';
import type {
  ActionView,
  AssetKind,
  AssetView,
  CredentialsStatus,
  DesignOrg,
  DraftSavePayload,
  DraftView,
  DraftWithDesign,
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
    /** Only a 409 DRAFT_CONFLICT carries data: the newer draft with its design. */
    readonly data?: unknown,
  ) {
    super(message);
  }
}

export type CredRoute = 'org' | 'actions' | 'me' | 'designs';

/** True for an error that means "pair this device again" (the sign-in prompt is shown). */
export const isSessionError = (e: unknown): boolean => e instanceof CredentialsApiError && e.code === 'session';

async function failure(res: Response): Promise<CredentialsApiError> {
  const j = (await res.json().catch(() => null)) as { code?: string; message?: string; data?: unknown } | null;
  if (res.status === 401) return new CredentialsApiError(401, 'session', t('Deine Anmeldung ist abgelaufen. Melde dich unter Start neu an.'));
  if (res.status === 403 && j?.code === 'APP_ONLY') return new CredentialsApiError(403, 'APP_ONLY', t('Das geht nur in der Röbel App.'));
  // A proxy in front of the function may refuse a large body without JSON.
  if (res.status === 413 && !j?.message) return new CredentialsApiError(413, 'TOO_LARGE', t('Das Bild ist zu groß (höchstens 8 MB).'));
  // Server messages are German product text (plan 2) and are shown as they are.
  return new CredentialsApiError(res.status, j?.code ?? 'failed', j?.message ?? t('Fehler {status}', { status: res.status }), j?.data);
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
    if (!res.ok) return { enabled: false, configured: false, designer: false };
    const j = (await res.json()) as Partial<CredentialsStatus> & { data?: Partial<CredentialsStatus> };
    const s = j.data ?? j;
    return { enabled: s.enabled === true, configured: s.configured === true, designer: s.designer === true };
  } catch {
    return { enabled: false, configured: false, designer: false };
  }
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

// ---- card designer (D2) ----------------------------------------------------------------

/** POST /api/credentials/designs with { action, payload }; same error mapping as credCall. */
export const designCall = <T>(action: string, payload: Record<string, unknown>, token: string) => credCall<T>('designs', action, payload, token);

export const fetchDesignOrgs = (token: string) => designCall<DesignOrg[]>('design_orgs', {}, token);

export const fetchDrafts = (token: string, accountId: string) => designCall<DraftView[]>('design_drafts_list', { accountId }, token);

export const fetchDraft = (token: string, draftId: string) => designCall<DraftWithDesign>('design_draft_get', { draftId }, token);

export const saveDraft = (token: string, p: DraftSavePayload) => designCall<DraftView>('design_draft_save', { ...p }, token);

export const deleteDraft = (token: string, draftId: string) => designCall<null>('design_draft_delete', { draftId }, token);

export const fetchDesignAssets = (token: string, accountId: string) => designCall<AssetView[]>('design_assets_list', { accountId }, token);

export const sendDraftTest = (token: string, draftId: string) => designCall<{ sentAt: string }>('design_test_send', { draftId }, token);

export const publishDraft = (token: string, draftId: string) => designCall<{ actionId: string; version: number; sha: string }>('design_publish', { draftId }, token);

/** Multipart upload of a design image (logo, sticker, background, image). */
export async function uploadDesignAsset(token: string, accountId: string, kind: AssetKind, file: File): Promise<AssetView> {
  const form = new FormData();
  form.append('accountId', accountId);
  form.append('kind', kind);
  form.append('file', file, file.name);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/credentials/designs/assets`, {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new CredentialsApiError(0, 'network', t('Server nicht erreichbar. Internetverbindung prüfen.'));
  }
  if (!res.ok) throw await failure(res);
  const j = (await res.json().catch(() => null)) as { ok?: boolean; data?: AssetView; code?: string; message?: string } | null;
  if (!j || j.ok === false || !j.data) throw new CredentialsApiError(res.status, j?.code ?? 'failed', j?.message ?? t('Unerwartete Antwort vom Server.'));
  return j.data;
}
