// NSP-13 Stage 2: a Vorhaben action signed with the person's own Nostr key IS the API request
// (POST /api/vorhaben/events, apps/web/src/lib/vorhaben/person-events.ts). The town only relays it.
//
// Signing is local (the key lives on this device), so no wallet prompt and no sign queue. Whenever the
// event path is not available — no key, no registered binding, server feature off, a shape the server
// refuses before acting — the caller falls back to the legacy wallet-signed request. The fallback is only
// taken when the server certainly did NOT apply the action (never after a timeout or an unknown failure).
import { buildEvent, type NostrEvent } from '@netizen-labs/nostr';
import { headAddress, payloadHash, pollAddress, taskAddress } from '@netizen-labs/protocol';
import { randomUUID } from 'expo-crypto';
import { getApiBaseUrl, type ApiResult, type VorhabenAction } from '../signed-request';
import { getRegisteredAt, loadStoredIdentity } from './identity';

export type PersonRole = 'proposer' | 'assignee' | 'attester' | 'wahlhelfer';

/** What the screen knows about the object; the server checks every claim against its own state. */
export interface TaskEventContext {
  /** proposals.proposal_id — the key the NSP-12 head is published under. */
  proposalKey: string;
  /** The role the signer acts in (screen context). */
  role: PersonRole;
  /** Current task status (the `from` tag); not needed for task_create. */
  status?: string | null;
}

/** API action → NSP-13 action (parity with PERSON_SIGNED_ACTIONS in person-events.ts). Applications stay legacy. */
export const PERSON_SIGNED_ACTIONS: Readonly<Partial<Record<VorhabenAction, string>>> = {
  task_create: 'task_created', task_assign: 'task_assigned', task_start: 'task_started', task_proof: 'proof_added',
  task_submit: 'task_submitted', task_approve: 'task_approved', task_request_changes: 'changes_requested',
  task_cancel: 'task_cancelled',
};

const TARGET_STATUS: Record<string, string> = {
  task_created: 'offen', task_assigned: 'vergeben', task_started: 'in_arbeit', proof_added: 'in_arbeit',
  task_submitted: 'eingereicht', task_approved: 'abgenommen', changes_requested: 'in_arbeit', task_cancelled: 'abgebrochen',
  tally_confirmed: 'bestaetigt',
};

/** Fixed German content per action (the server rejects anything else). */
export const DEFAULT_CONTENT: Record<string, string> = {
  task_created: 'Aufgabe angelegt.',
  task_assigned: 'Aufgabe vergeben.',
  task_started: 'Aufgabe gestartet.',
  proof_added: 'Nachweis hinzugefügt.',
  task_submitted: 'Zur Abnahme eingereicht.',
  task_approved: 'Aufgabe abgenommen.',
  changes_requested: 'Änderungen angefordert.',
  task_cancelled: 'Aufgabe abgebrochen.',
  tally_confirmed: 'Wahlhelfer:in bestätigt das Bürgervotum.',
};
const PUBLIC_REASON_ACTIONS = new Set(['changes_requested', 'task_cancelled']);

/** The role the server derives for `action` (same rule as the nostr_outbox trigger); null = not person-signable. */
export function personRoleFor(action: VorhabenAction, isProposer: boolean): PersonRole | null {
  const nsp = PERSON_SIGNED_ACTIONS[action];
  if (!nsp) return null;
  if (nsp === 'task_approved' || nsp === 'changes_requested') return 'attester';
  if (nsp === 'task_assigned' || nsp === 'task_cancelled' || nsp === 'task_created') return isProposer ? 'proposer' : 'attester';
  return 'assignee';
}

const HEX64 = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lowerUuid = (v: unknown): string | null => (typeof v === 'string' && UUID_RE.test(v.trim()) ? v.trim().toLowerCase() : null);
const nowSec = () => Math.floor(Date.now() / 1000);

/** url/tx tags for a proof's attachments, exactly as the server expects them. */
function proofTags(attachments: unknown): string[][] {
  if (!Array.isArray(attachments)) return [];
  const out: string[][] = [];
  for (const a of attachments as Array<Record<string, unknown>>) {
    const type = a?.type;
    if ((type === 'image' || type === 'pdf') && typeof a.url === 'string' && /^https?:\/\//.test(a.url)) out.push(['url', a.url, type]);
    else if (type === 'tx' && typeof a.hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(a.hash.trim())) out.push(['tx', a.hash.trim().toLowerCase()]);
  }
  return out;
}

interface Common { secretKey: Uint8Array; pubkey: string; town: string; seq: number; now?: number }

function baseTags(c: Common, object: string, proposalKey: string, action: string, role: string, from: string | null,
  payload: Record<string, unknown>, now: number): string[][] {
  const tags: string[][] = [
    ['a', object, '', 'object'],
    ['a', headAddress(c.town, proposalKey), '', 'proposal'],
    ['action', action],
  ];
  if (from) tags.push(['from', from]);
  tags.push(
    ['to', TARGET_STATUS[action]],
    ['p', c.pubkey, '', role],
    ['role', role],
    ['seq', String(c.seq)],
    ['occurred_at', String(now)],
    ['payload_hash', payloadHash(payload)],
  );
  return tags;
}

/** The kind-2101 event for a task action. `payload` must be exactly what is sent (incl. taskId). */
export function buildTaskActionEvent(c: Common & {
  action: VorhabenAction; payload: Record<string, unknown>; ctx: TaskEventContext;
}): NostrEvent {
  const nsp = PERSON_SIGNED_ACTIONS[c.action];
  if (!nsp) throw new Error(`${c.action} is not person-signable`);
  const taskId = lowerUuid(c.payload.taskId);
  if (!taskId) throw new Error('taskId missing');
  const now = c.now ?? nowSec();
  const status = c.ctx.status ?? null;
  const from = nsp === 'task_created' ? null : nsp === 'proof_added' ? (status === 'vergeben' ? 'vergeben' : null) : status;
  const reason = typeof c.payload.body === 'string' ? c.payload.body.trim() : '';
  const content = PUBLIC_REASON_ACTIONS.has(nsp) && reason ? reason : DEFAULT_CONTENT[nsp];
  const tags = baseTags(c, taskAddress(c.town, taskId), c.ctx.proposalKey, nsp, c.ctx.role, from, c.payload, now);
  if (nsp === 'proof_added') tags.push(...proofTags(c.payload.attachments));
  return buildEvent(c.secretKey, 2101, content, { tags, createdAt: now });
}

/** The ["Ergebnis-Hash 0x…"] the signed tally text ends with (tally-message.ts). */
export function resultHashOf(message: string): string | null {
  return /Ergebnis-Hash (0x[0-9a-fA-F]{64})\.?\s*$/.exec(message)?.[1]?.toLowerCase() ?? null;
}

/** The kind-2101 tally_confirmed event; the wallet signature over `message` rides along as a tag. */
export function buildTallyConfirmEvent(c: Common & {
  proposalKey: string; proposalId: string; message: string; signature: string; signerAccount: string;
}): NostrEvent | null {
  const resultHash = resultHashOf(c.message);
  if (!resultHash) return null;
  const now = c.now ?? nowSec();
  const payload = { proposalId: c.proposalId, signature: c.signature };
  const tags = baseTags(c, pollAddress(c.town, c.proposalKey), c.proposalKey, 'tally_confirmed', 'wahlhelfer', null, payload, now);
  tags.push(
    ['signed_text', c.message],
    ['signature', c.signature],
    ['signer_account', c.signerAccount.toLowerCase()],
    ['result_hash', resultHash],
    ['chain', '100'],
  );
  return buildEvent(c.secretKey, 2101, DEFAULT_CONTENT.tally_confirmed, { tags, createdAt: now });
}

// ---- Transport ---------------------------------------------------------------------------------

export const CONFIG_TIMEOUT_MS = 10000;
export const SEQ_TIMEOUT_MS = 15000;
export const EVENT_TIMEOUT_MS = 25000;
const CONFIG_TTL_MS = 60 * 60 * 1000;
const CONFIG_OFF_TTL_MS = 5 * 60 * 1000;

/**
 * Server codes that are returned BEFORE the action runs (event shape / binding / feature switch) and never by
 * the task rules themselves → the legacy request is safe and keeps the person's action working.
 */
const FALLBACK_CODES = new Set([
  'FEATURE_OFF', 'NOT_BOUND', 'WALLET_MISMATCH', 'BAD_EVENT', 'EVENT_TOO_LARGE', 'BAD_EVENT_SIGNATURE', 'STALE_EVENT',
  'TAG_NOT_ALLOWED', 'BAD_ACTOR', 'NOT_PERSON_SIGNABLE', 'PAYLOAD_MISMATCH', 'ACTION_MISMATCH', 'OBJECT_MISMATCH',
  'CONTENT_NOT_ALLOWED', 'ROLE_MISMATCH', 'ROLE_NOT_ALLOWED',
]);

export type EventOutcome<T> = { kind: 'done'; result: ApiResult<T> } | { kind: 'fallback'; reason: string };
const fallback = (reason: string): { kind: 'fallback'; reason: string } => ({ kind: 'fallback', reason });

async function fetchJson(path: string, init: RequestInit, ms: number): Promise<{ status: number; json: any } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, { ...init, signal: controller.signal });
    let json: any = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status ?? 200, json };
  } catch {
    return null; // network error or timeout
  } finally {
    clearTimeout(timer);
  }
}

let townCache: { town: string | null; until: number } | null = null;
/** Test hook. */
export function resetVorhabenEventCache(): void { townCache = null; }

/** The town pubkey from GET /api/vorhaben/config; null when the feature is off or unreachable. */
export async function getTownPubkey(): Promise<string | null> {
  if (townCache && townCache.until > Date.now()) return townCache.town;
  const r = await fetchJson('/api/vorhaben/config', { method: 'GET' }, CONFIG_TIMEOUT_MS);
  if (!r) return null; // offline: do not cache, try again next time
  const raw = r.json?.data?.townPubkey ?? r.json?.townPubkey;
  const town = typeof raw === 'string' && HEX64.test(raw.trim().toLowerCase()) ? raw.trim().toLowerCase() : null;
  townCache = { town, until: Date.now() + (town ? CONFIG_TTL_MS : CONFIG_OFF_TTL_MS) };
  return town;
}

async function nextSeq(object: string): Promise<number | null> {
  const r = await fetchJson(`/api/vorhaben/seq?object=${encodeURIComponent(object)}`, { method: 'GET' }, SEQ_TIMEOUT_MS);
  const n = r?.json?.ok ? r.json.data?.next : null;
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** Key + registered binding + town key, or null (→ legacy path). */
async function signer(): Promise<{ secretKey: Uint8Array; pubkey: string; town: string } | null> {
  try {
    const identity = await loadStoredIdentity();
    if (!identity || !(await getRegisteredAt())) return null;
    const town = await getTownPubkey();
    if (!town) return null;
    return { secretKey: identity.secretKey, pubkey: identity.publicKey, town };
  } catch {
    return null;
  }
}

/**
 * POSTs the event; on SEQ_CONFLICT rebuilds once with the server's `next`. Pre-action refusals → fallback;
 * a timeout or any other failure is final (the action may have been applied).
 */
async function postEvent<T>(build: (seq: number) => NostrEvent, firstSeq: number, body: (event: NostrEvent) => Record<string, unknown>): Promise<EventOutcome<T>> {
  let seq = firstSeq;
  for (let attempt = 0; attempt < 2; attempt++) {
    const event = build(seq);
    const r = await fetchJson('/api/vorhaben/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(event)),
    }, EVENT_TIMEOUT_MS);
    if (!r) return { kind: 'done', result: { ok: false, code: 'NETWORK_ERROR', message: 'Keine Verbindung. Bitte versuche es erneut.' } };
    const j = r.json;
    if (!j || typeof j !== 'object' || !('ok' in j)) {
      // Route missing on an older server: nothing ran.
      if (r.status === 404 || r.status === 405) return fallback(`events route ${r.status}`);
      return { kind: 'done', result: { ok: false, code: 'BAD_RESPONSE', message: 'Unerwartete Antwort vom Server' } };
    }
    if (j.ok) return { kind: 'done', result: { ok: true, data: (j.data ?? {}) as T } };
    const code = String(j.code ?? '');
    if (code === 'SEQ_CONFLICT' && attempt === 0 && Number.isSafeInteger(j.next) && j.next >= 1) { seq = j.next; continue; }
    if (FALLBACK_CODES.has(code)) return fallback(code);
    return { kind: 'done', result: { ok: false, code, message: String(j.message ?? 'Aktion fehlgeschlagen.') } };
  }
  return { kind: 'done', result: { ok: false, code: 'SEQ_CONFLICT', message: 'Inzwischen ist eine andere Aktion eingegangen. Bitte lade neu.' } };
}

/** A task action as a person-signed event. `fallback` → send the legacy wallet-signed request instead. */
export async function sendTaskActionEvent<T>(
  wallet: string, action: VorhabenAction, payload: Record<string, unknown>, ctx: TaskEventContext,
): Promise<EventOutcome<T>> {
  if (!PERSON_SIGNED_ACTIONS[action]) return fallback('not person-signable');
  if (!ctx.proposalKey || !ctx.role) return fallback('context missing');
  if (action !== 'task_create' && !ctx.status) return fallback('status missing');
  const s = await signer();
  if (!s) return fallback('no identity or feature off');
  // task_created must name its address before the row exists: the app picks the id (server accepts it).
  const body = action === 'task_create' && !lowerUuid(payload.taskId) ? { ...payload, taskId: randomUUID() } : payload;
  const taskId = lowerUuid(body.taskId);
  if (!taskId) return fallback('taskId missing');
  const seq = await nextSeq(taskAddress(s.town, taskId));
  if (seq === null) return fallback('seq unavailable');
  try {
    return await postEvent<T>(
      (n) => buildTaskActionEvent({ ...s, seq: n, action, payload: body, ctx }),
      seq,
      (event) => ({ event, action, payload: body, wallet: wallet.toLowerCase() }),
    );
  } catch (err) {
    // buildEvent threw (should not happen): nothing was sent.
    console.warn('[vorhaben/events] build failed', (err as Error)?.message);
    return fallback('build failed');
  }
}

/** The Wahlhelfer co-sign as a person-signed event carrying the wallet signature. */
export async function sendTallyConfirmEvent(
  wallet: string, proposalId: string, proposalKey: string, message: string, signature: string,
): Promise<EventOutcome<{ lineIds: string[] }>> {
  if (!proposalKey) return fallback('context missing');
  const s = await signer();
  if (!s) return fallback('no identity or feature off');
  const seq = await nextSeq(pollAddress(s.town, proposalKey));
  if (seq === null) return fallback('seq unavailable');
  if (!resultHashOf(message)) return fallback('no result hash in message');
  return postEvent<{ lineIds: string[] }>(
    (n) => buildTallyConfirmEvent({ ...s, seq: n, proposalKey, proposalId, message, signature, signerAccount: wallet })!,
    seq,
    (event) => ({ event, kind: 'tally_confirm', proposalId, signature, wallet: wallet.toLowerCase() }),
  );
}
