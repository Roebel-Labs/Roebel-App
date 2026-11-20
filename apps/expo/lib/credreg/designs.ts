/**
 * Card designer calls (POST /api/credentials/designs, D2): drafts, the org's images, test-send and
 * publish, all signed like the other credential routes; plus the public status (`designer`) and
 * the multipart image upload. Never throws: failures are { ok: false, code, message } with German
 * messages. A 409 DRAFT_CONFLICT carries the newer server draft in `data`.
 */
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import type { CardDesign } from '@roebel/card-design';
import {
  CREDENTIALS_SCOPE,
  buildSignedMessage,
  getApiBaseUrl,
  postSigned,
  signQueued,
  type ApiResult,
  type CredentialAction,
  type SigningAccount,
} from '@/lib/signed-request';

export type DesignKind = 'role' | 'membership' | 'badge';
export type AssetKind = 'logo' | 'sticker' | 'background' | 'image';

/** D2 DesignOrg. */
export type DesignOrg = { accountId: string; name: string; avatarUrl: string | null; role: 'owner' | 'admin' };

/** D2 DraftView, field for field. */
export type DraftView = {
  id: string;
  /** The draft's org (absent on servers before 2026-11-20). */
  accountId?: string;
  name: string;
  kind: DesignKind;
  template: string | null;
  typeId: string | null;
  revision: number;
  updatedAt: string;
  liveVersion: number | null;
  pendingVersion: number | null;
  hasUnpublishedChanges: boolean;
  testSentAt: string | null;
};
export type DraftWithDesign = DraftView & { design: CardDesign };

/** D2 AssetView. */
export type AssetView = { sha: string; kind: AssetKind; url: string; width: number | null; height: number | null; ai: boolean };

export type DesignPublished = { actionId: string; version: number; sha: string };

/** A failed call; `data` only on 409 DRAFT_CONFLICT (the newer server draft). */
export type DesignFail = { ok: false; code: string; message: string; data?: DraftWithDesign };
export type DesignResult<T> = { ok: true; data: T } | DesignFail;

export type DesignAction = Exclude<Extract<CredentialAction, `design_${string}`>, 'design_asset_upload'>;

/** Shown when a draft (or its test link) belongs to an org the caller does not administer. */
export const DRAFT_ADMIN_ONLY = 'Dieser Entwurf ist nur für die Verwaltung der Organisation sichtbar.';

/** German message for a failed call; refusals about a draft become the admin-only text. */
export function designErrorMessage(r: { code: string; message: string }, context: 'draft' | 'other' = 'other'): string {
  if (context === 'draft' && (r.code === 'FORBIDDEN' || r.code === 'NOT_FOUND')) return DRAFT_ADMIN_ONLY;
  if (r.code === 'NETWORK_ERROR') return 'Keine Verbindung. Bitte versuche es gleich noch einmal.';
  if (r.code === 'SIGN_FAILED') return 'Die Bestätigung wurde abgebrochen.';
  return r.message || 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
}

export async function designApi<T>(account: SigningAccount, action: DesignAction, payload: Record<string, unknown>): Promise<DesignResult<T>> {
  try {
    const res = (await postSigned<T>('/api/credentials/designs', account, action, payload, CREDENTIALS_SCOPE)) as
      | ApiResult<T>
      | (ApiResult<T> & { data?: unknown });
    if (res.ok) return res;
    const extra = (res as { data?: unknown }).data;
    return res.code === 'DRAFT_CONFLICT' && extra && typeof extra === 'object'
      ? { ok: false, code: res.code, message: res.message, data: extra as DraftWithDesign }
      : { ok: false, code: res.code, message: res.message };
  } catch (err) {
    return { ok: false, code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Netzwerkfehler' };
  }
}

export const fetchDesignOrgs = (a: SigningAccount) => designApi<DesignOrg[]>(a, 'design_orgs', {});
export const fetchDrafts = (a: SigningAccount, accountId: string) => designApi<DraftView[]>(a, 'design_drafts_list', { accountId });
export const fetchDraft = (a: SigningAccount, draftId: string) => designApi<DraftWithDesign>(a, 'design_draft_get', { draftId });
export const deleteDraft = (a: SigningAccount, draftId: string) => designApi<null>(a, 'design_draft_delete', { draftId });
export const fetchDesignAssets = (a: SigningAccount, accountId: string) => designApi<AssetView[]>(a, 'design_assets_list', { accountId });
export const sendDraftTest = (a: SigningAccount, draftId: string) => designApi<{ sentAt: string }>(a, 'design_test_send', { draftId });
export const publishDraft = (a: SigningAccount, draftId: string) => designApi<DesignPublished>(a, 'design_publish', { draftId });

// ── AI help (D5) ─────────────────────────────────────────────────────────────

export type AiKind = 'background' | 'sticker';
export type AiBackgroundResult = { asset: AssetView; background: CardDesign['background'] };
export type AiStickerResult = { asset: AssetView; layer: CardDesign['layers'][number]; notice?: string };

/** A generated card background (up to a minute; 429 AI_LIMIT / 504 AI_TIMEOUT as German messages). */
export const generateDesignBackground = (a: SigningAccount, accountId: string, prompt: string) =>
  designApi<AiBackgroundResult>(a, 'design_ai_background', { accountId, prompt });
/** A generated sticker, background removed when possible (`notice` otherwise). */
export const generateDesignSticker = (a: SigningAccount, accountId: string, prompt: string) =>
  designApi<AiStickerResult>(a, 'design_ai_sticker', { accountId, prompt });

/** True when a design contains AI images: an `ai` layer or an AI background asset. */
export function designHasAi(design: CardDesign | null | undefined, assets: readonly { sha: string; ai: boolean }[] = []): boolean {
  if (!design) return false;
  if (design.layers.some((l) => l.ai === true)) return true;
  const bg = design.background;
  return bg.kind === 'image' && assets.some((x) => x.ai && x.sha === bg.assetId);
}

export type SaveDraftInput = {
  accountId: string;
  /** Absent = a new draft. With it, `baseRevision` is required. */
  draftId?: string;
  baseRevision?: number;
  name: string;
  kind: DesignKind;
  template?: string | null;
  design: CardDesign;
};

export function saveDraft(a: SigningAccount, p: SaveDraftInput): Promise<DesignResult<DraftWithDesign>> {
  const payload: Record<string, unknown> = { accountId: p.accountId, name: p.name, kind: p.kind, design: p.design };
  if (p.draftId) {
    payload.draftId = p.draftId;
    payload.baseRevision = p.baseRevision ?? 0;
  }
  if (p.template !== undefined) payload.template = p.template;
  return designApi<DraftWithDesign>(a, 'design_draft_save', payload);
}

// ── status ───────────────────────────────────────────────────────────────────

export type CredentialStatus = { enabled: boolean; configured: boolean; designer: boolean };
let statusCache: { at: number; value: CredentialStatus } | null = null;
const STATUS_TTL_MS = 60_000;

/** GET /api/credentials/status (public). Unreadable = everything off (fail closed). */
export async function fetchCredentialStatus(timeoutMs = 8000): Promise<CredentialStatus> {
  if (statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) return statusCache.value;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/credentials/status`, { signal: ctl.signal });
    if (res.status !== 200) return { enabled: false, configured: false, designer: false };
    const j = (await res.json()) as Partial<CredentialStatus> | null;
    const value = { enabled: j?.enabled === true, configured: j?.configured === true, designer: j?.designer === true };
    statusCache = { at: Date.now(), value };
    return value;
  } catch {
    return { enabled: false, configured: false, designer: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Test hook. */
export function __resetCredentialStatus(): void {
  statusCache = null;
}

// ── image upload ─────────────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export type UploadDeps = {
  readBase64: (uri: string) => Promise<string>;
  sha256Hex: (bytes: Uint8Array) => Promise<string>;
  post: (url: string, form: FormData) => Promise<{ status: number; json: unknown }>;
};

const defaultUploadDeps: UploadDeps = {
  readBase64: (uri) => FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }),
  sha256Hex: async (bytes) => toHex(await digest(CryptoDigestAlgorithm.SHA256, bytes as unknown as BufferSource)),
  post: async (url, form) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 60_000);
    try {
      const res = await fetch(url, { method: 'POST', body: form, signal: ctl.signal });
      return { status: res.status, json: await res.json().catch(() => null) };
    } finally {
      clearTimeout(timer);
    }
  },
};

/**
 * Uploads a picked image (local file `uri`) as an org image. The signed payload carries the
 * file's sha256, so the signature covers the file (D2). Always a wallet signature: the passkey
 * session token is not used for multipart uploads.
 */
export async function uploadDesignAsset(
  account: SigningAccount,
  p: { accountId: string; kind: AssetKind; uri: string; mime: string; name?: string },
  deps: UploadDeps = defaultUploadDeps,
): Promise<DesignResult<AssetView>> {
  try {
    const sha256 = await deps.sha256Hex(base64ToBytes(await deps.readBase64(p.uri)));
    const payload = { accountId: p.accountId, kind: p.kind, sha256 };
    const wallet = account.address.toLowerCase();
    const timestampSec = Math.floor(Date.now() / 1000);
    const action = 'design_asset_upload' as const;
    const signature = await signQueued(account, await buildSignedMessage(action, wallet, timestampSec, payload, CREDENTIALS_SCOPE));
    const form = new FormData();
    form.append('request', JSON.stringify({ scope: CREDENTIALS_SCOPE, action, wallet, timestampSec, payload, signature }));
    // React Native's FormData takes a file descriptor object.
    form.append('file', { uri: p.uri, name: p.name ?? `bild.${p.mime.split('/')[1] ?? 'png'}`, type: p.mime } as unknown as Blob);
    const res = await deps.post(`${getApiBaseUrl()}/api/credentials/designs/assets`, form);
    const json = res.json as { ok?: boolean; data?: AssetView; code?: string; message?: string } | null;
    if (json?.ok === true && json.data) return { ok: true, data: json.data };
    return { ok: false, code: json?.code ?? 'BAD_RESPONSE', message: json?.message ?? 'Das Bild konnte nicht hochgeladen werden.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/Signatur/.test(msg)) return { ok: false, code: 'SIGN_FAILED', message: msg };
    return { ok: false, code: 'NETWORK_ERROR', message: msg || 'Netzwerkfehler' };
  }
}
