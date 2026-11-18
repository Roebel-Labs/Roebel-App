/**
 * The org side on the phone: describe, check and confirm a register action that was prepared on a
 * computer or in the app.
 *
 * The server sends steps, a summary and its registry address; all three are untrusted. The phone
 * re-parses the steps (parseSteps), describes them itself (describeSteps, never the server's
 * title), refuses when the summary's numbers do not match the steps (checkSummary), refuses an
 * action meant for another registry, checks the caller's authority on chain, encodes against the
 * app's own REGISTRY and sends everything as one operation. Never logs and never returns a raw
 * error: errors can carry addresses or call data.
 */
import { credentialTypeId, encodeSteps, parseSteps, type RegisterStep } from '@netizen-labs/credential-registry';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Account } from 'thirdweb/wallets';
import type { Address, Hex } from 'viem';
import { orgIdFromUuid } from '@/lib/org-safe/ops';
import { sendOrgCallsKeepingHash } from '@/lib/org-safe/send';
import { classifySendError } from '@/lib/org-safe/send-errors';
import type { ApiResult, SigningAccount } from '@/lib/signed-request';
import { prepareEventBadge, reportSubmitted } from './api';
import { REGISTRY, readBatchType, readTypeOrg, registryReader } from './chain';
import { credentialsConfigured } from './gate';
import type { ActionSubmitted, ActionSummary, CredentialKind, EventBadgeGetResult, EventBadgePrepared, PhoneAction } from './types';

export const UNKNOWN_TYPE = 'Unbekannter Typ';

export const ROLE_SYNC_MESSAGE =
  'Dein Konto ist für diese Organisation noch nicht im Register berechtigt. Gleiche zuerst die Rollen ab: Organisation → Einstellungen → Onchain-Organisation.';

const FAILED = 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
const CANCELLED = 'Abgebrochen. Es wurde nichts gesendet.';
const CHAIN_UNAVAILABLE = 'Das Register ist gerade nicht erreichbar. Es wurde nichts gesendet. Bitte versuche es gleich noch einmal.';
const OTHER_REGISTRY = 'Diese Aktion gehört zu einem anderen Register. Sie wird aus Sicherheitsgründen nicht bestätigt.';
const UNKNOWN_STEPS = 'Diese Aktion enthält Schritte, die die App nicht kennt. Sie wird aus Sicherheitsgründen nicht bestätigt.';
const NOT_CONFIGURED = 'Ausweise gibt es in deiner App bald.';
const NO_RECEIPT =
  'Die Aktion wurde gesendet, aber die App hat keine Quittung erhalten. Bitte schau in der Übersicht nach, bevor du es noch einmal versuchst.';
const NOT_YOUR_ORG = 'Diese Aktion gehört zu keiner Organisation, die du verwaltest. Sie wird nicht bestätigt.';
const SEVERAL_ORGS = 'Diese Aktion betrifft mehrere Organisationen. Sie wird aus Sicherheitsgründen nicht bestätigt.';
const UNKNOWN_ORG = 'Ein Schritt dieser Aktion gehört zu keinem bekannten Ausweis. Sie wird nicht bestätigt.';
const OTHER_DELEGATE = 'Diese Aktion berechtigt ein anderes Konto als das, das du gewählt hast. Sie wird nicht bestätigt.';
export const NO_NAME_ACCOUNT = 'ein Konto ohne Namen';
const REPORT_PENDING = 'Die Aktion wurde gesendet. Die App konnte es noch nicht melden. Bitte tippe auf „Erneut melden“.';

const SUBMITTED_COPY: Record<string, string> = {
  TX_MISMATCH: 'Die Transaktion passt nicht zu dieser Aktion. Bitte bereite die Aktion neu vor.',
  TX_IN_USE: 'Diese Transaktion gehört schon zu einer anderen Aktion.',
  TX_CONFLICT: 'Für diese Aktion wurde schon eine andere Transaktion gemeldet.',
  RECHECK_NEEDED: 'Einige Ausweise waren schon widerrufen. Bitte prüfe die Liste und bereite den Widerruf neu vor.',
  ACTION_EXPIRED: 'Diese Bestätigung ist abgelaufen. Bitte bereite die Aktion neu vor.',
  ACTION_NOT_PENDING: 'Diese Aktion wartet nicht mehr auf eine Bestätigung.',
  TX_REVERTED: 'Die Transaktion wurde abgelehnt. Es wurde nichts geändert.',
  NETWORK_ERROR: 'Keine Verbindung. Bitte versuche es noch einmal.',
};

/** German copy for an error of the credential routes (action_submitted, action_get, prepare calls). */
export function submittedMessage(res: { code: string; message: string }): string {
  const known = SUBMITTED_COPY[res.code];
  if (known) return known;
  if (typeof res.message === 'string' && res.message.length > 0 && !/0x[0-9a-fA-F]{6,}/.test(res.message)) return res.message;
  return FAILED;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * One German line per step, built from the steps only. `names` and `kinds` come from the org's
 * own type list; an unknown name is "Unbekannter Typ".
 */
export function describeSteps(
  steps: readonly RegisterStep[],
  names: (typeId: Hex) => string | null,
  kinds: (typeId: Hex) => CredentialKind | null = () => null,
  accounts: (address: string) => string | null = () => null,
): string[] {
  const who = (address: string) => accounts(address.toLowerCase()) ?? NO_NAME_ACCOUNT;
  const name = (typeId: Hex) => names(typeId.toLowerCase() as Hex) ?? names(typeId) ?? UNKNOWN_TYPE;
  const kind = (typeId: Hex) => kinds(typeId.toLowerCase() as Hex) ?? kinds(typeId);
  return steps.map((s) => {
    switch (s.fn) {
      case 'createType':
        return `Ausweis-Typ anlegen: ${name(credentialTypeId(s.orgId, s.localId))}`;
      case 'updateType':
        return `Ausweis-Typ ändern: ${name(s.typeId)}`;
      case 'retireType':
        return `Ausweis-Typ dauerhaft stilllegen: ${name(s.typeId)}`;
      case 'setDelegate':
        return s.allowed
          ? `Ein Konto zum Ausstellen berechtigen: ${who(s.delegate)} für ${name(s.typeId)}`
          : `Berechtigung zum Ausstellen entziehen: ${who(s.delegate)} für ${name(s.typeId)}`;
      case 'setOrgPrivateOnly':
        return s.privateOnly ? 'Mitglieder nur noch privat zulassen' : 'Mitglieder dürfen öffentlich sichtbar sein';
      case 'addBatch':
        return kind(s.typeId) === 'badge'
          ? `${s.count} Abzeichen vergeben: ${name(s.typeId)}`
          : `${plural(s.count, 'Ausweis', 'Ausweise')} ausstellen: ${name(s.typeId)}`;
      case 'revokeLeaves':
        return `${plural(s.leaves.length, 'Ausweis', 'Ausweise')} widerrufen`;
      case 'revokeBatch':
        return 'Eine ganze Ausstellung widerrufen';
      default:
        return UNKNOWN_TYPE;
    }
  });
}

/**
 * The numbers the summary announces must be the steps' numbers: the sum of `addBatch.count`
 * equals `counts.app + counts.link`. A batch without announced counts, or counts without a batch,
 * is refused too.
 */
export function checkSummary(steps: readonly RegisterStep[], summary: ActionSummary): { ok: true } | { ok: false; reason: string } {
  const batches = steps.filter((s): s is Extract<RegisterStep, { fn: 'addBatch' }> => s.fn === 'addBatch');
  const inSteps = batches.reduce((sum, s) => sum + s.count, 0);
  const counts = summary?.counts;
  if (!counts) {
    return batches.length === 0 ? { ok: true } : { ok: false, reason: 'Die Zusammenfassung nennt keine Anzahl. Die Aktion wird nicht bestätigt.' };
  }
  const app = Number(counts.app);
  const link = Number(counts.link);
  if (!Number.isSafeInteger(app) || !Number.isSafeInteger(link) || app < 0 || link < 0) {
    return { ok: false, reason: 'Die Zusammenfassung ist fehlerhaft. Die Aktion wird nicht bestätigt.' };
  }
  if (app + link !== inSteps) {
    return {
      ok: false,
      reason: `Angekündigt sind ${app + link}, die Aktion enthält aber ${inSteps}. Sie wird nicht bestätigt. Bitte bereite sie neu vor.`,
    };
  }
  return { ok: true };
}

/** Resolves with the hash once the operation is out (also when the receipt wait failed); throws only when nothing was sent. */
type Send = (account: Account, calls: readonly { to: Address; data: Hex }[]) => Promise<{ txHash: Hex; confirmed: boolean } | null>;

/** An org of the caller, from orgs_list. */
export type PhoneOrg = { accountId: string; name: string };

/** The delegate accounts named in setDelegate steps (lowercase), for naming them. */
export function delegateAccounts(steps: readonly RegisterStep[]): Address[] {
  const out = new Set<string>();
  for (const s of steps) if (s.fn === 'setDelegate') out.add(s.delegate.toLowerCase());
  return [...out] as Address[];
}

// An action started in this app for one chosen account: the approve screen refuses any other.
const expectedDelegates = new Map<string, string>();
export function rememberExpectedDelegate(actionId: string, wallet: string): void {
  expectedDelegates.set(actionId, wallet.toLowerCase());
}
export function expectedDelegateFor(actionId: string): string | null {
  return expectedDelegates.get(actionId) ?? null;
}

/** True when the app expected one account and the steps name another (or none). */
export function delegateMismatch(steps: readonly RegisterStep[], expected: string | null | undefined): boolean {
  if (!expected) return false;
  const set = steps.filter((s): s is Extract<RegisterStep, { fn: 'setDelegate' }> => s.fn === 'setDelegate');
  return set.length === 0 || set.some((s) => s.delegate.toLowerCase() !== expected.toLowerCase());
}

type OrgReads = { typeOrg: (typeId: Hex) => Promise<Hex | null>; batchType: (batchId: bigint) => Promise<Hex | null> };

/**
 * Every step must belong to ONE org, and that org must be one of the caller's (orgId =
 * orgIdFromUuid(accountId)). Types resolve through getType, batches through getBatch → type.
 * Throws on RPC failure.
 */
export async function resolveActionOrg(
  steps: readonly RegisterStep[],
  orgs: readonly PhoneOrg[],
  d: OrgReads,
): Promise<{ ok: true; orgId: Hex; org: PhoneOrg } | { ok: false; reason: string }> {
  const ids = new Set<string>();
  for (const s of steps) {
    let orgId: Hex | null = null;
    switch (s.fn) {
      case 'createType':
      case 'setOrgPrivateOnly':
        orgId = s.orgId;
        break;
      case 'updateType':
      case 'retireType':
      case 'setDelegate':
      case 'addBatch':
        orgId = await d.typeOrg(s.typeId);
        break;
      case 'revokeLeaves':
      case 'revokeBatch': {
        const typeId = await d.batchType(BigInt(s.batchId));
        orgId = typeId ? await d.typeOrg(typeId) : null;
        break;
      }
    }
    if (!orgId) return { ok: false, reason: UNKNOWN_ORG };
    ids.add(orgId.toLowerCase());
  }
  if (ids.size !== 1) return { ok: false, reason: ids.size === 0 ? UNKNOWN_ORG : SEVERAL_ORGS };
  const [orgId] = [...ids] as Hex[];
  const org = orgs.find((o) => {
    try {
      return orgIdFromUuid(o.accountId).toLowerCase() === orgId;
    } catch {
      return false;
    }
  });
  return org ? { ok: true, orgId, org } : { ok: false, reason: NOT_YOUR_ORG };
}

/** Caches the chain reads of one confirmation (org binding and authority read the same types). */
function memoReads(d: OrgReads): OrgReads {
  const types = new Map<string, Promise<Hex | null>>();
  const batches = new Map<string, Promise<Hex | null>>();
  return {
    typeOrg: (typeId) => {
      const k = typeId.toLowerCase();
      if (!types.has(k)) types.set(k, d.typeOrg(typeId));
      return types.get(k)!;
    },
    batchType: (batchId) => {
      const k = batchId.toString();
      if (!batches.has(k)) batches.set(k, d.batchType(batchId));
      return batches.get(k)!;
    },
  };
}

export type ConfirmDeps = {
  configured: () => boolean;
  canManage: (orgId: Hex, account: Address) => Promise<boolean>;
  canIssue: (typeId: Hex, account: Address) => Promise<boolean>;
  /** The org of a type; null = unknown type. Throws on RPC failure. */
  typeOrg: (typeId: Hex) => Promise<Hex | null>;
  /** The type of a batch; null = unknown batch. Throws on RPC failure. */
  batchType: (batchId: bigint) => Promise<Hex | null>;
  send: Send;
  report: (a: SigningAccount, actionId: string, txHash: Hex) => Promise<ApiResult<ActionSubmitted>>;
  nowMs: () => number;
  /** Signs the API request; defaults to the sending account (same address). */
  apiAccount?: SigningAccount;
  /** The caller's orgs (orgs_list). Every step must belong to exactly one of them. */
  orgs?: readonly PhoneOrg[];
  /** Set when the action was started in this app for one chosen account (setDelegate). */
  expectedDelegate?: string | null;
};

const defaultDeps: ConfirmDeps = {
  configured: credentialsConfigured,
  canManage: (orgId, account) => registryReader().canManage(orgId, account),
  canIssue: (typeId, account) => registryReader().canIssue(typeId, account),
  typeOrg: readTypeOrg,
  batchType: readBatchType,
  send: sendOrgCallsKeepingHash,
  report: reportSubmitted,
  nowMs: () => Date.now(),
};

export type ConfirmResult =
  | { ok: true; status: 'done' | 'submitted' }
  /**
   * `sent`: the operation went out; never send again, only report this hash again.
   * `locked`: it may have gone out without a hash; never send again, check the overview.
   */
  | { ok: false; message: string; sent?: { txHash: Hex }; locked?: true };

/** Can the caller do every step on chain? Throws on RPC failure. */
async function mayDoAll(steps: readonly RegisterStep[], who: Address, d: ConfirmDeps): Promise<boolean> {
  const manage = new Map<string, Promise<boolean>>();
  const issue = new Map<string, Promise<boolean>>();
  const canManage = (orgId: Hex) => {
    const k = orgId.toLowerCase();
    if (!manage.has(k)) manage.set(k, d.canManage(orgId, who));
    return manage.get(k)!;
  };
  const canIssue = (typeId: Hex) => {
    const k = typeId.toLowerCase();
    if (!issue.has(k)) issue.set(k, d.canIssue(typeId, who));
    return issue.get(k)!;
  };
  const manageType = async (typeId: Hex) => {
    const orgId = await d.typeOrg(typeId);
    return orgId !== null && (await canManage(orgId));
  };
  const issueBatch = async (batchId: string) => {
    const typeId = await d.batchType(BigInt(batchId));
    return typeId !== null && (await canIssue(typeId));
  };
  for (const s of steps) {
    let ok: boolean;
    switch (s.fn) {
      case 'createType':
      case 'setOrgPrivateOnly':
        ok = await canManage(s.orgId);
        break;
      case 'updateType':
      case 'retireType':
      case 'setDelegate':
        ok = await manageType(s.typeId);
        break;
      case 'addBatch':
        ok = await canIssue(s.typeId);
        break;
      case 'revokeLeaves':
      case 'revokeBatch':
        ok = await issueBatch(s.batchId);
        break;
      default:
        ok = false;
    }
    if (!ok) return false;
  }
  return true;
}

// ── "possibly sent" lock ─────────────────────────────────────────────────────
// An action whose operation may be on its way (send outcome unknown) or is known to be on its way
// but not yet reported is never sent again: not in this session (memory) and not after a restart
// (AsyncStorage `credreg:sent-lock:v1:<actionId>`, value { at, until, txHash? }). `txHash` is set
// when the send succeeded but reporting it failed: the screen then only offers "Erneut melden"
// with that hash. Values without `txHash` (older app versions) still lock. A lock lasts until the
// action's own expiresAt, at most 7 days, and is cleared once the server reports the action as no
// longer awaiting (done, cancelled, failed, expired). Fail closed: when the storage cannot be read
// and a lock write was attempted in this session, the action counts as locked; otherwise
// (nothing locked this session) it does not.
const SENT_LOCK_PREFIX = 'credreg:sent-lock:v1:';
const SENT_LOCK_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
/** Locked action id → the sent transaction hash, or null when the hash is unknown. */
const possiblySent = new Map<string, Hex | null>();
let lockWrittenThisSession = false;

export function sentLockKey(actionId: string): string {
  return SENT_LOCK_PREFIX + actionId;
}

/** Synchronous check of this session's locks (the screen also loads the stored one). */
export function isPossiblySent(actionId: string): boolean {
  return possiblySent.has(actionId);
}

/**
 * Locks an action in memory and on the device; `txHash` when the operation is known to be out
 * (only the report failed). Never throws.
 */
export async function markPossiblySent(actionId: string, expiresAt: string, nowMs: number, txHash?: Hex): Promise<void> {
  const hash = txHash && TX_HASH.test(txHash) ? txHash : (possiblySent.get(actionId) ?? null);
  possiblySent.set(actionId, hash);
  lockWrittenThisSession = true;
  const exp = Date.parse(expiresAt);
  const until = Math.min(Number.isFinite(exp) ? exp : nowMs + SENT_LOCK_MAX_MS, nowMs + SENT_LOCK_MAX_MS);
  try {
    await AsyncStorage.setItem(sentLockKey(actionId), JSON.stringify(hash ? { at: nowMs, until, txHash: hash } : { at: nowMs, until }));
  } catch {
    // memory still locks this session; a later read failure fails closed (lockWrittenThisSession)
  }
}

/** The lock of an action (this session or a stored, unexpired one) and its hash if known. Never throws. */
export async function readSentLock(actionId: string, nowMs: number): Promise<{ locked: boolean; txHash: Hex | null }> {
  if (possiblySent.has(actionId)) return { locked: true, txHash: possiblySent.get(actionId) ?? null };
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(sentLockKey(actionId));
  } catch {
    return { locked: lockWrittenThisSession, txHash: null };
  }
  if (!raw) return { locked: false, txHash: null };
  let until = 0;
  let txHash: Hex | null = null;
  try {
    const v = JSON.parse(raw) as { until?: unknown; txHash?: unknown };
    until = typeof v?.until === 'number' ? v.until : 0;
    txHash = typeof v?.txHash === 'string' && TX_HASH.test(v.txHash) ? (v.txHash as Hex) : null;
  } catch {
    until = 0;
  }
  if (until > nowMs) {
    possiblySent.set(actionId, txHash);
    return { locked: true, txHash };
  }
  await clearSentLock(actionId);
  return { locked: false, txHash: null };
}

/** Is the action locked (this session or a stored, unexpired lock)? Never throws. */
export async function hasSentLock(actionId: string, nowMs: number): Promise<boolean> {
  return (await readSentLock(actionId, nowMs)).locked;
}

/** The server no longer awaits the action: its lock has done its job. Never throws. */
export async function clearSentLock(actionId: string): Promise<void> {
  possiblySent.delete(actionId);
  try {
    await AsyncStorage.removeItem(sentLockKey(actionId));
  } catch {
    // harmless: an expired or settled lock is dropped on the next read
  }
}

/** Tests only: a fresh app session (memory gone, device storage kept). */
export function __resetPossiblySent(): void {
  possiblySent.clear();
  lockWrittenThisSession = false;
}

/** Reports a sent operation; a network failure is tried once more. */
export async function reportSent(
  apiAccount: SigningAccount,
  actionId: string,
  txHash: Hex,
  report: ConfirmDeps['report'] = reportSubmitted,
): Promise<ConfirmResult> {
  let res = await report(apiAccount, actionId, txHash);
  if (!res.ok && res.code === 'NETWORK_ERROR') res = await report(apiAccount, actionId, txHash);
  if (res.ok) return { ok: true, status: res.data.status };
  if (res.code === 'NETWORK_ERROR') return { ok: false, message: REPORT_PENDING, sent: { txHash } };
  return { ok: false, message: submittedMessage(res), sent: { txHash } };
}

/**
 * Confirms a prepared action: checks it, sends all steps as one operation from the caller's own
 * account to the app's REGISTRY, then reports the transaction hash. A refused or failed send
 * leaves the action untouched on the server.
 */
export async function confirmAction(account: Account, action: PhoneAction, deps?: Partial<ConfirmDeps>): Promise<ConfirmResult> {
  const d: ConfirmDeps = { ...defaultDeps, ...deps };
  if (!d.configured()) return { ok: false, message: NOT_CONFIGURED };
  if (action.status !== 'awaiting_confirmation') {
    await clearSentLock(action.id);
    return { ok: false, message: action.status === 'expired' ? SUBMITTED_COPY.ACTION_EXPIRED : SUBMITTED_COPY.ACTION_NOT_PENDING };
  }
  const expires = Date.parse(action.expiresAt);
  if (Number.isFinite(expires) && expires <= d.nowMs()) return { ok: false, message: SUBMITTED_COPY.ACTION_EXPIRED };
  if (typeof action.registry !== 'string' || action.registry.toLowerCase() !== REGISTRY.toLowerCase()) {
    return { ok: false, message: OTHER_REGISTRY };
  }

  let steps: RegisterStep[];
  try {
    steps = parseSteps(action.steps);
  } catch {
    return { ok: false, message: UNKNOWN_STEPS };
  }
  if (steps.length === 0) return { ok: false, message: UNKNOWN_STEPS };

  const summary = checkSummary(steps, action.summary);
  if (!summary.ok) return { ok: false, message: summary.reason };
  if (delegateMismatch(steps, d.expectedDelegate)) return { ok: false, message: OTHER_DELEGATE };

  const reads = memoReads(d);
  const checked: ConfirmDeps = { ...d, ...reads };
  try {
    const bound = await resolveActionOrg(steps, d.orgs ?? [], reads);
    if (!bound.ok) return { ok: false, message: bound.reason };
    if (!(await mayDoAll(steps, account.address as Address, checked))) return { ok: false, message: ROLE_SYNC_MESSAGE };
  } catch {
    return { ok: false, message: CHAIN_UNAVAILABLE };
  }

  // Checked right before sending: a lock from this session or from before a restart. With a
  // stored hash the operation is out: only reporting it again is offered.
  const lock = await readSentLock(action.id, d.nowMs());
  if (lock.locked && lock.txHash) return { ok: false, message: REPORT_PENDING, sent: { txHash: lock.txHash } };
  if (lock.locked) return { ok: false, message: NO_RECEIPT, locked: true };

  let sent: { txHash: Hex; confirmed: boolean } | null;
  try {
    sent = await d.send(account, encodeSteps(steps, REGISTRY));
  } catch (err) {
    const outcome = classifySendError(err);
    if (outcome === 'rejected') return { ok: false, message: CANCELLED };
    if (outcome === 'not_sent') return { ok: false, message: FAILED };
    if (outcome === 'reverted') return { ok: false, message: SUBMITTED_COPY.TX_REVERTED };
    // Possibly on its way without a hash (receipt timeout, network failure): never send again.
    await markPossiblySent(action.id, action.expiresAt, d.nowMs());
    return { ok: false, message: NO_RECEIPT, locked: true };
  }
  if (!sent) {
    await markPossiblySent(action.id, action.expiresAt, d.nowMs());
    return { ok: false, message: NO_RECEIPT, locked: true };
  }
  // Out on the chain: from here on only the report may be repeated, never the send. A failed report
  // locks the action with its hash on the device, so a restart offers "Erneut melden", not a resend.
  const reported = await reportSent(d.apiAccount ?? account, action.id, sent.txHash, d.report);
  if (!reported.ok) await markPossiblySent(action.id, action.expiresAt, d.nowMs(), sent.txHash);
  return reported;
}

// ── context for the approve screen ───────────────────────────────────────────

/** Lowercase type id → name / kind, from the org's own type list. */
export type TypeNames = { names: (typeId: Hex) => string | null; kinds: (typeId: Hex) => CredentialKind | null };

export function typeNamesFrom(types: readonly { typeId: Hex; name: string; kind: CredentialKind | null }[]): TypeNames {
  const byId = new Map(types.map((t) => [t.typeId.toLowerCase(), t]));
  return {
    names: (typeId) => byId.get(typeId.toLowerCase())?.name ?? null,
    kinds: (typeId) => byId.get(typeId.toLowerCase())?.kind ?? null,
  };
}

/** "Vorbereitet am Computer" / "Vorbereitet in der App"; null when unknown. */
export function preparedLabel(via: string | null | undefined): string | null {
  if (via === 'app') return 'Vorbereitet in der App';
  if (via === 'dashboard' || via === 'studio' || via === 'node') return 'Vorbereitet am Computer';
  return null;
}

/** "TT.MM.JJJJ" (or "T.M.JJJJ") → "JJJJ-MM-TT" for `validUntil`; '' for empty input, null when invalid. */
export function germanDateToIso(input: string): string | null {
  const v = input.trim();
  if (v === '') return '';
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * What the approve screen shows: the phone's own description of the steps, the verified counts,
 * and the reason it will not confirm (null = may confirm). Same checks as confirmAction, minus the
 * chain reads.
 */
export function reviewAction(
  action: PhoneAction,
  t: TypeNames,
  nowMs: number = Date.now(),
  opts: { accounts?: (address: string) => string | null; expectedDelegate?: string | null; locked?: boolean; sentTxHash?: Hex | null } = {},
): { lines: string[]; counts: { app: number; link: number } | null; problem: string | null; hasBatch: boolean } {
  let steps: RegisterStep[];
  try {
    steps = parseSteps(action.steps);
  } catch {
    return { lines: [], counts: null, problem: UNKNOWN_STEPS, hasBatch: false };
  }
  const lines = describeSteps(steps, t.names, t.kinds, opts.accounts);
  const hasBatch = steps.some((s) => s.fn === 'addBatch');
  const summary = checkSummary(steps, action.summary);
  const counts = summary.ok && action.summary?.counts ? { app: action.summary.counts.app, link: action.summary.counts.link } : null;
  let problem: string | null = null;
  if (steps.length === 0) problem = UNKNOWN_STEPS;
  else if (typeof action.registry !== 'string' || action.registry.toLowerCase() !== REGISTRY.toLowerCase()) problem = OTHER_REGISTRY;
  else if (!summary.ok) problem = summary.reason;
  else if (delegateMismatch(steps, opts.expectedDelegate)) problem = OTHER_DELEGATE;
  else if (action.status === 'expired' || (Number.isFinite(Date.parse(action.expiresAt)) && Date.parse(action.expiresAt) <= nowMs)) {
    problem = SUBMITTED_COPY.ACTION_EXPIRED;
  } else if (action.status !== 'awaiting_confirmation') problem = SUBMITTED_COPY.ACTION_NOT_PENDING;
  else if (opts.sentTxHash || possiblySent.get(action.id)) problem = REPORT_PENDING;
  else if (opts.locked || possiblySent.has(action.id)) problem = NO_RECEIPT;
  return { lines, counts, problem, hasBatch };
}

/** Server text for a list row (e.g. an action's title): shown only when it carries no address or hash. */
export function safeServerText(text: unknown, fallback: string): string {
  return typeof text === 'string' && text.trim().length > 0 && !/0x[0-9a-fA-F]{6,}/.test(text) ? text : fallback;
}

// ── event badges ──────────────────────────────────────────────────────────────

/** Same wording as the web panel's primary button (apps/web/src/lib/credentials/event-panel.ts). */
export const EVENT_BADGE_LABELS = {
  setup: 'Abzeichen für Teilnehmende einrichten',
  issue: (n: number) => `Abzeichen vergeben (${n})`,
  allIssued: 'Alle haben ihr Abzeichen',
  register: 'Abzeichen jetzt anlegen',
  noAttendees: 'Noch keine Teilnehmenden',
} as const;

/** The organiser's badge row; null = no row (gate closed, not owner/admin, or not loaded). */
export function eventBadgeRow(g: EventBadgeGetResult | null): { label: string; disabled: boolean } | null {
  if (!g) return null;
  if (!g.badge) return { label: EVENT_BADGE_LABELS.setup, disabled: false };
  if (g.notYetIssued > 0) return { label: EVENT_BADGE_LABELS.issue(g.notYetIssued), disabled: false };
  if (g.badge.chain === 'draft') return { label: EVENT_BADGE_LABELS.register, disabled: false };
  if (g.attendees === 0) return { label: EVENT_BADGE_LABELS.noAttendees, disabled: true };
  return { label: EVENT_BADGE_LABELS.allIssued, disabled: true };
}

/** Tap on the badge row: prepare on the server, then open the approve screen with the new action. */
export async function issueEventBadge(
  account: SigningAccount,
  p: { eventId: string; orgAccountId: string },
  deps: {
    prepare?: (a: SigningAccount, eventId: string) => Promise<ApiResult<EventBadgePrepared>>;
    navigate: (route: { pathname: '/org/credentials/approve/[id]'; params: { id: string; org: string } }) => void;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await (deps.prepare ?? prepareEventBadge)(account, p.eventId);
  if (!res.ok) return { ok: false, message: safeServerText(res.message, 'Das hat nicht geklappt. Bitte versuche es gleich noch einmal.') };
  deps.navigate({ pathname: '/org/credentials/approve/[id]', params: { id: res.data.actionId, org: p.orgAccountId } });
  return { ok: true };
}
