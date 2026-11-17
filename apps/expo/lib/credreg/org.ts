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
import type { Account } from 'thirdweb/wallets';
import type { Address, Hex } from 'viem';
import { sendOrgCalls } from '@/lib/org-safe/send';
import type { ApiResult, SigningAccount } from '@/lib/signed-request';
import { reportSubmitted } from './api';
import { REGISTRY, readBatchType, readTypeOrg, registryReader } from './chain';
import { credentialsConfigured } from './gate';
import type { ActionSubmitted, ActionSummary, CredentialKind, PhoneAction } from './types';

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
): string[] {
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
          ? `Ein Konto zum Ausstellen berechtigen: ${name(s.typeId)}`
          : `Berechtigung zum Ausstellen entziehen: ${name(s.typeId)}`;
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

type Send = (account: Account, calls: readonly { to: Address; data: Hex }[]) => Promise<Hex | null>;

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
};

const defaultDeps: ConfirmDeps = {
  configured: credentialsConfigured,
  canManage: (orgId, account) => registryReader().canManage(orgId, account),
  canIssue: (typeId, account) => registryReader().canIssue(typeId, account),
  typeOrg: readTypeOrg,
  batchType: readBatchType,
  send: sendOrgCalls,
  report: reportSubmitted,
  nowMs: () => Date.now(),
};

export type ConfirmResult =
  | { ok: true; status: 'done' | 'submitted' }
  /** `sent`: the operation went out; never send again, only report this hash again. */
  | { ok: false; message: string; sent?: { txHash: Hex } };

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

const isRejection = (err: unknown) => /reject|denied|cancel|abgebrochen/i.test(String((err as Error)?.message ?? err ?? ''));

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

  try {
    if (!(await mayDoAll(steps, account.address as Address, d))) return { ok: false, message: ROLE_SYNC_MESSAGE };
  } catch {
    return { ok: false, message: CHAIN_UNAVAILABLE };
  }

  let txHash: Hex | null;
  try {
    txHash = await d.send(account, encodeSteps(steps, REGISTRY));
  } catch (err) {
    return { ok: false, message: isRejection(err) ? CANCELLED : FAILED };
  }
  if (!txHash) return { ok: false, message: NO_RECEIPT };
  return reportSent(d.apiAccount ?? account, action.id, txHash, d.report);
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
): { lines: string[]; counts: { app: number; link: number } | null; problem: string | null; hasBatch: boolean } {
  let steps: RegisterStep[];
  try {
    steps = parseSteps(action.steps);
  } catch {
    return { lines: [], counts: null, problem: UNKNOWN_STEPS, hasBatch: false };
  }
  const lines = describeSteps(steps, t.names, t.kinds);
  const hasBatch = steps.some((s) => s.fn === 'addBatch');
  const summary = checkSummary(steps, action.summary);
  const counts = summary.ok && action.summary?.counts ? { app: action.summary.counts.app, link: action.summary.counts.link } : null;
  let problem: string | null = null;
  if (steps.length === 0) problem = UNKNOWN_STEPS;
  else if (typeof action.registry !== 'string' || action.registry.toLowerCase() !== REGISTRY.toLowerCase()) problem = OTHER_REGISTRY;
  else if (!summary.ok) problem = summary.reason;
  else if (action.status === 'expired' || (Number.isFinite(Date.parse(action.expiresAt)) && Date.parse(action.expiresAt) <= nowMs)) {
    problem = SUBMITTED_COPY.ACTION_EXPIRED;
  } else if (action.status !== 'awaiting_confirmation') problem = SUBMITTED_COPY.ACTION_NOT_PENDING;
  return { lines, counts, problem, hasBatch };
}
