/**
 * Mini-app identity (manifest version "2"): the host's client for POST {base}/api/mini-apps/identity
 * and the pure consent logic around it.
 *
 * - `fetchIdentityState` / `saveIdentityGrant` are signed requests under MINIAPP_SCOPE, built like
 *   the token request (lib/miniapp-token.ts). `fetchIdentityState` is a read (open, refresh,
 *   detail page) and never prompts: a passkey session uses only its existing API session token,
 *   else null. `saveIdentityGrant` is user-triggered and may sign a new passkey session; a
 *   thirdweb session signs silently. Every failure resolves to `null`; they never throw.
 * - `buildConsentItems` / `grantFromChoices` turn the manifest's `identity` section and the node's
 *   state into the consent sheet's rows and back into a grant.
 * - `shapeUser` is the one place that decides what `context.get().user` contains. Version 1 apps
 *   get exactly today's object; version 2 apps only what the person agreed to share.
 */
import type { Credential, MiniAppContext } from '@netizen-labs/miniapp-sdk';
import type { ConsentKey } from '@netizen-labs/miniapp-sdk/host';
import { miniAppApiBase } from './miniapp-api';
import { buildSignedMessage, enqueueSignature, signQueued, REQUEST_TIMEOUT_MS, type MiniAppAction } from './signed-request';
import { existingSessionOnly, signedOrSession } from './passkey/api-session-runtime';
import { passkeySessionOf } from './passkey/active';
import type { SessionSigner } from './passkey/api-session';
import type { MiniApp } from './miniapps';

const MINIAPP_SCOPE = 'roebel-miniapp-v1';
const PATH = '/api/mini-apps/identity';

export interface IdentityTypeInfo {
  name: string;
  orgName?: string;
  imageUrl?: string;
  /** The account holds this type privately (consent sheet only, never sent to the app). */
  private?: boolean;
}

/** Same shape as the node's IdentityState (apps/web/src/lib/miniapp/identityHandler.ts). */
export interface IdentityState {
  subject: string;
  asked: string[];
  granted: { profile: boolean; address: boolean; credentials: string[] };
  credentials: Credential[];
  types: Record<string, IdentityTypeInfo | null>;
}

export interface IdentityGrant {
  profile: boolean;
  address: boolean;
  credentials: string[];
  asked: string[];
}

function parseState(json: unknown): IdentityState | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  const g = j.granted as Record<string, unknown> | undefined;
  if (typeof j.subject !== 'string' || !j.subject) return null;
  if (!Array.isArray(j.asked) || !g || typeof g !== 'object') return null;
  if (!Array.isArray(j.credentials) || !j.types || typeof j.types !== 'object') return null;
  return {
    subject: j.subject,
    asked: j.asked.filter((a): a is string => typeof a === 'string'),
    granted: {
      profile: g.profile === true,
      address: g.address === true,
      credentials: Array.isArray(g.credentials) ? g.credentials.filter((c): c is string => typeof c === 'string') : [],
    },
    credentials: (j.credentials as unknown[]).filter(
      (c): c is Credential => !!c && typeof c === 'object' && typeof (c as Credential).type === 'string',
    ),
    types: j.types as Record<string, IdentityTypeInfo | null>,
  };
}

type Attempt = { status: number; code?: string; value: IdentityState | null };

async function post(body: unknown, headers: Record<string, string>): Promise<Attempt> {
  const base = miniAppApiBase();
  if (!base) return { status: 0, value: null };
  // RN fetch has no timeout of its own.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const status = res.status ?? 0;
    if (!res.ok) return { status, code: typeof json?.code === 'string' ? json.code : undefined, value: null };
    return { status, value: parseState(json) };
  } catch {
    return { status: 0, value: null };
  } finally {
    clearTimeout(timer);
  }
}

async function identityRequest(
  account: SessionSigner,
  action: MiniAppAction,
  payload: Record<string, unknown>,
  opts: { silent: boolean },
): Promise<IdentityState | null> {
  const wallet = account.address.toLowerCase();
  const withToken = (headers: Record<string, string>) =>
    post({ scope: MINIAPP_SCOPE, action, wallet, timestampSec: Math.floor(Date.now() / 1000), payload }, headers);
  try {
    if (opts.silent && passkeySessionOf(account)) {
      // A read on a passkey session: the existing session token or nothing. Never a fingerprint.
      return await existingSessionOnly<IdentityState | null>(account, {
        kind: 'web',
        endpoint: `web:${PATH}`,
        withToken,
        withoutToken: async () => null,
      });
    }
    const withSignature = async (): Promise<IdentityState | null> => {
      const timestampSec = Math.floor(Date.now() / 1000);
      const message = await buildSignedMessage(action, wallet, timestampSec, payload, MINIAPP_SCOPE);
      const signature = await signQueued(account, message);
      return (await post({ scope: MINIAPP_SCOPE, action, wallet, timestampSec, payload, signature }, {})).value;
    };
    const queued: SessionSigner = { ...account, signMessage: (args) => enqueueSignature(() => account.signMessage(args)) };
    return await signedOrSession<IdentityState | null>(queued, { kind: 'web', endpoint: `web:${PATH}`, withToken, withSignature });
  } catch {
    return null;
  }
}

/** The person's identity state for `appRef` (id or slug). Never throws; `null` on any failure. */
export function fetchIdentityState(account: SessionSigner, appRef: string): Promise<IdentityState | null> {
  return identityRequest(account, 'identity_get', { app: appRef }, { silent: true });
}

/** Store a grant (the node clamps it to the manifest) and return the new state. Never throws. */
export function saveIdentityGrant(
  account: SessionSigner,
  appRef: string,
  grant: IdentityGrant,
): Promise<IdentityState | null> {
  return identityRequest(account, 'identity_set', { app: appRef, grant }, { silent: false });
}

export interface ConsentItem {
  key: ConsentKey;
  title: string;
  detail: string;
  privateNote: boolean;
  defaultOn: boolean;
}

export const CONSENT_COPY = {
  profileTitle: 'Name und Bild',
  profileDetail: 'Dein Anzeigename und dein Profilbild.',
  addressTitle: 'Deine Kontoadresse',
  addressDetail:
    'Damit die App Transaktionen für dich vorbereiten kann. Ohne sie bekommt die App nur eine anonyme Kennung, die bei jeder Mini-App anders ist.',
  privateNote: 'Diese Mitgliedschaft ist privat. Die App erfährt nur, dass du Mitglied bist.',
} as const;

/** The consent sheet's rows for `keys`, in that order. Unknown credential types are left out. */
export function buildConsentItems(
  app: Pick<MiniApp, 'identity'>,
  state: IdentityState,
  keys: ConsentKey[],
): ConsentItem[] {
  const items: ConsentItem[] = [];
  for (const key of keys) {
    if (key === 'profile') {
      items.push({ key, title: CONSENT_COPY.profileTitle, detail: CONSENT_COPY.profileDetail, privateNote: false, defaultOn: true });
    } else if (key === 'address') {
      items.push({ key, title: CONSENT_COPY.addressTitle, detail: CONSENT_COPY.addressDetail, privateNote: false, defaultOn: true });
    } else {
      const ref = key.slice('cred:'.length);
      const info = state.types[ref];
      const req = app.identity?.credentials.find((c) => c.type === ref);
      if (!info || !req) continue;
      items.push({
        key,
        title: info.orgName ? `${info.name} · ${info.orgName}` : info.name,
        detail: req.reason,
        privateNote: info.private === true,
        defaultOn: true,
      });
    }
  }
  return items;
}

/** Earlier grants stay, switched-on shown items are added, every shown key counts as asked. */
export function grantFromChoices(
  app: Pick<MiniApp, 'identity'>,
  state: IdentityState,
  shown: ConsentKey[],
  on: Set<ConsentKey>,
): IdentityGrant {
  const requested = new Set((app.identity?.credentials ?? []).map((c) => c.type));
  const credentials = [...state.granted.credentials];
  for (const key of shown) {
    if (!key.startsWith('cred:') || !on.has(key)) continue;
    const ref = key.slice('cred:'.length);
    if (requested.has(ref) && !credentials.includes(ref)) credentials.push(ref);
  }
  const asked = [...state.asked];
  for (const key of shown) if (!asked.includes(key)) asked.push(key);
  return {
    profile: state.granted.profile || (shown.includes('profile') && on.has('profile')),
    address: state.granted.address || (shown.includes('address') && on.has('address')),
    credentials,
    asked,
  };
}

/** What `context.get().user` contains. */
export function shapeUser(
  app: Pick<MiniApp, 'manifestVersion'>,
  state: IdentityState | null,
  user: { address: string; displayName?: string; avatarUrl?: string; isCitizen: boolean },
): MiniAppContext['user'] {
  if (app.manifestVersion !== 2) {
    return { id: user.address, displayName: user.displayName, avatarUrl: user.avatarUrl, isCitizen: user.isCitizen };
  }
  // No state (offline, node down): a signed-out user rather than a leak.
  if (!state) return null;
  const out: NonNullable<MiniAppContext['user']> = {
    id: state.granted.address ? user.address : state.subject,
    isCitizen: state.credentials.some((c) => c.type === 'citizen'),
  };
  if (state.granted.profile) {
    if (user.displayName) out.displayName = user.displayName;
    if (user.avatarUrl) out.avatarUrl = user.avatarUrl;
  }
  return out;
}

/** The current grant with one item switched (detail page "Zugriff"); the key counts as asked. */
export function grantWithItem(state: IdentityState, key: ConsentKey, value: boolean): IdentityGrant {
  const g = state.granted;
  const asked = state.asked.includes(key) ? [...state.asked] : [...state.asked, key];
  if (key === 'profile') return { profile: value, address: g.address, credentials: [...g.credentials], asked };
  if (key === 'address') return { profile: g.profile, address: value, credentials: [...g.credentials], asked };
  const ref = key.slice('cred:'.length);
  const rest = g.credentials.filter((c) => c !== ref);
  return { profile: g.profile, address: g.address, credentials: value ? [...rest, ref] : rest, asked };
}

/** Everything withdrawn; what was asked stays asked (no new sheet on the next open). */
export function grantWithdrawAll(state: IdentityState): IdentityGrant {
  return { profile: false, address: false, credentials: [], asked: [...state.asked] };
}

/** Whether `key` is granted in `state`. */
export function isGranted(state: IdentityState, key: ConsentKey): boolean {
  if (key === 'profile') return state.granted.profile;
  if (key === 'address') return state.granted.address;
  return state.granted.credentials.includes(key.slice('cred:'.length));
}

/** Same credentials (by `type` and `validUntil`, order ignored)? Absent and null expiry are equal. */
export function credentialsEqual(a: Credential[], b: Credential[]): boolean {
  if (a.length !== b.length) return false;
  const key = (c: Credential) => `${c.type}|${c.validUntil ?? ''}`;
  const sa = a.map(key).sort();
  const sb = b.map(key).sort();
  return sa.every((k, i) => k === sb[i]);
}

/**
 * Did the grant (or the subject) change between two states? The mini-app user token carries the
 * granted address / name / credentials in its claims, so the host drops its cached token then.
 * No previous state counts as changed.
 */
export function grantChanged(prev: IdentityState | null, next: IdentityState): boolean {
  if (!prev) return true;
  if (prev.subject !== next.subject) return true;
  const a = prev.granted;
  const b = next.granted;
  if (a.profile !== b.profile || a.address !== b.address) return true;
  if (a.credentials.length !== b.credentials.length) return true;
  const sa = [...a.credentials].sort();
  const sb = [...b.credentials].sort();
  return sa.some((c, i) => c !== sb[i]);
}

/**
 * credentials.request: the requested types in the manifest's spelling (matched case-insensitively,
 * like the node's clampGrant; duplicates collapse), or null when one is not requested by the
 * reviewed manifest.
 */
export function manifestCredentialTypes(app: Pick<MiniApp, 'identity'>, types: string[]): string[] | null {
  const byLower = new Map((app.identity?.credentials ?? []).map((c) => [c.type.toLowerCase(), c.type]));
  const out: string[] = [];
  for (const t of types) {
    const ref = byLower.get(t.toLowerCase());
    if (!ref) return null;
    if (!out.includes(ref)) out.push(ref);
  }
  return out;
}
