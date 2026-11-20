/**
 * The org's side of a mini-app binding (POST {base}/api/mini-apps/org-binding, signed under
 * MINIAPP_SCOPE). A version-2 manifest names an org; an owner or admin of that org confirms,
 * rejects or later removes it here. Only a confirmed binding shows the app on the org's page
 * and under "Meine Vereine".
 *
 * Built like the identity requests (lib/miniapp-identity.ts): a passkey session uses its API
 * session token, a thirdweb session signs silently. Every failure resolves to `null`.
 */
import { miniAppApiBase } from './miniapp-api';
import { buildSignedMessage, enqueueSignature, signQueued, REQUEST_TIMEOUT_MS, type MiniAppAction } from './signed-request';
import { signedOrSession } from './passkey/api-session-runtime';
import type { SessionSigner } from './passkey/api-session';

const MINIAPP_SCOPE = 'roebel-miniapp-v1';
const PATH = '/api/mini-apps/org-binding';

export type OrgBinding = 'none' | 'requested' | 'confirmed' | 'rejected';
export type OrgBindingDecision = 'confirm' | 'reject' | 'remove';

export interface OrgBindingItem {
  id: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  binding: OrgBinding;
}

const BINDINGS: readonly OrgBinding[] = ['none', 'requested', 'confirmed', 'rejected'];
const isBinding = (v: unknown): v is OrgBinding => typeof v === 'string' && (BINDINGS as readonly string[]).includes(v);

/** What the org may do from a status: requested → confirm/reject, confirmed → remove, rejected → confirm. */
export function bindingActions(b: OrgBinding): OrgBindingDecision[] {
  if (b === 'requested') return ['confirm', 'reject'];
  if (b === 'confirmed') return ['remove'];
  if (b === 'rejected') return ['confirm'];
  return [];
}

type Attempt = { status: number; code?: string; value: Record<string, unknown> | null };

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
    return { status, value: json && typeof json === 'object' ? json : null };
  } catch {
    return { status: 0, value: null };
  } finally {
    clearTimeout(timer);
  }
}

async function bindingRequest(
  account: SessionSigner,
  action: MiniAppAction,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const wallet = account.address.toLowerCase();
  const withToken = (headers: Record<string, string>) =>
    post({ scope: MINIAPP_SCOPE, action, wallet, timestampSec: Math.floor(Date.now() / 1000), payload }, headers);
  const withSignature = async (): Promise<Record<string, unknown> | null> => {
    const timestampSec = Math.floor(Date.now() / 1000);
    const message = await buildSignedMessage(action, wallet, timestampSec, payload, MINIAPP_SCOPE);
    const signature = await signQueued(account, message);
    return (await post({ scope: MINIAPP_SCOPE, action, wallet, timestampSec, payload, signature }, {})).value;
  };
  try {
    const queued: SessionSigner = { ...account, signMessage: (args) => enqueueSignature(() => account.signMessage(args)) };
    return await signedOrSession<Record<string, unknown> | null>(queued, {
      kind: 'web',
      endpoint: `web:${PATH}`,
      withToken,
      withSignature,
    });
  } catch {
    return null;
  }
}

function parseItem(v: unknown): OrgBindingItem | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.slug !== 'string' || typeof r.name !== 'string') return null;
  if (!isBinding(r.binding)) return null;
  return { id: r.id, slug: r.slug, name: r.name, iconUrl: typeof r.iconUrl === 'string' ? r.iconUrl : null, binding: r.binding };
}

/** The mini apps that name this org (owner/admin only). `null` on any failure. Never throws. */
export async function listOrgBindings(account: SessionSigner, orgAccountId: string): Promise<OrgBindingItem[] | null> {
  const json = await bindingRequest(account, 'org_binding_list', { account: orgAccountId.toLowerCase() });
  if (!json || !Array.isArray(json.apps)) return null;
  return json.apps.map(parseItem).filter((i): i is OrgBindingItem => i !== null);
}

/** Confirm, reject or remove an app's binding. Returns the new binding, `null` on any failure. */
export async function decideOrgBinding(
  account: SessionSigner,
  appId: string,
  decision: OrgBindingDecision,
): Promise<OrgBinding | null> {
  const json = await bindingRequest(account, 'org_binding_decide', { app: appId, decision });
  return json && isBinding(json.binding) ? json.binding : null;
}
