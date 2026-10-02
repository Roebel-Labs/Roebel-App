// Proposal lifecycle data for the app. Reads go straight to Supabase (public tables);
// writes go to the web API (apps/web/src/app/api/vorhaben/*).
import { supabase } from './supabase';
import {
  getApiBaseUrl, postSigned, signQueued, VORHABEN_SCOPE, type ApiResult, type SigningAccount, type VorhabenAction,
} from './signed-request';
import { sendTallyConfirmEvent, sendTaskActionEvent, type TaskEventContext } from './nostr/vorhaben-events';
import { contractPurpose, type Asset, type LineStatus, type Stage, type TaskStatus } from './vorhaben-labels';

export interface TallyDuty { proposalUuid: string; proposalKey: string; proposalNumber: number; title: string; until: string }
export interface TallyView {
  proposalId: string; proposalNumber: number; title: string; message: string;
  forVotes: string; againstVotes: string; abstainVotes: string; tallyAddress: string; until: string;
  eligible: boolean; confirmedAt: string | null; reward: { amount: string; asset: Asset };
}

/** Supabase reads ride on RN fetch, which never times out: every read gets an abort deadline. */
export const READ_TIMEOUT_MS = 15000;
async function timed<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
/** Like `timed`, but a failed or aborted read resolves to `fallback` (for optional UI). */
async function soft<T>(fallback: T, read: () => Promise<T>): Promise<T> {
  try { return await read(); } catch { return fallback; }
}

async function getJson<T>(path: string): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, { signal: controller.signal });
    return (await res.json()) as ApiResult<T>;
  } catch (err) {
    return { ok: false, code: 'NETWORK_ERROR', message: err instanceof Error ? err.message : 'Netzwerkfehler' };
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveProposalUuid(proposalKey: string): Promise<string | null> {
  const { data, error } = await timed((signal) => supabase.from('proposals').select('id').eq('proposal_id', proposalKey).abortSignal(signal).maybeSingle());
  if (error) throw new Error(error.message);
  return (data as { id: string } | null)?.id ?? null;
}

/** id + proposer of a proposal (for task_create: the role the creator signs in). null when missing. */
export async function resolveProposalForTask(proposalKey: string): Promise<{ id: string; proposer: string } | null> {
  const { data, error } = await timed((signal) => supabase.from('proposals').select('id, proposer_address').eq('proposal_id', proposalKey).abortSignal(signal).maybeSingle());
  if (error) throw new Error(error.message);
  const row = data as { id: string; proposer_address: string | null } | null;
  return row ? { id: row.id, proposer: (row.proposer_address ?? '').toLowerCase() } : null;
}

export function fetchOpenTallyDuties(wallet: string): Promise<TallyDuty[]> {
  return soft([], async () => {
    const { data, error } = await timed((signal) => supabase
      .from('proposal_wahlhelfer')
      .select('proposal_id, proposals!inner(proposal_id, proposal_number, title, tally_confirm_until)')
      .eq('attester_wallet', wallet.toLowerCase())
      .is('confirmed_at', null)
      .abortSignal(signal));
    if (error || !data) return [];
    const now = Date.now();
    return (data as any[])
      .map((r) => ({ proposalUuid: r.proposal_id, proposalKey: r.proposals.proposal_id, proposalNumber: r.proposals.proposal_number,
        title: r.proposals.title, until: r.proposals.tally_confirm_until }))
      .filter((d) => d.until && new Date(d.until).getTime() > now);
  });
}

export function fetchTallyView(proposalUuid: string, wallet: string): Promise<ApiResult<TallyView>> {
  return getJson<TallyView>(`/api/vorhaben/tally-confirm?proposalId=${proposalUuid}&wallet=${wallet.toLowerCase()}`);
}

/**
 * The Wahlhelfer co-sign: one wallet signature over `message`. With a registered Nostr key it travels inside a
 * person-signed event (NSP-13 Stage 2, needs `proposalKey`); otherwise as the legacy request.
 */
export async function submitTally(
  account: SigningAccount, proposalUuid: string, message: string, proposalKey?: string,
): Promise<ApiResult<{ lineIds: string[] }>> {
  let signature: string;
  try {
    signature = await signQueued(account, message);
  } catch {
    return { ok: false, code: 'SIGN_FAILED', message: 'Signatur abgebrochen oder fehlgeschlagen.' };
  }
  if (proposalKey) {
    const outcome = await sendTallyConfirmEvent(account.address, proposalUuid, proposalKey, message, signature);
    if (outcome.kind === 'done') return outcome.result;
    console.warn('[vorhaben] tally confirm via legacy request:', outcome.reason);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/vorhaben/tally-confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ proposalId: proposalUuid, wallet: account.address.toLowerCase(), signature }),
    });
    return (await res.json()) as ApiResult<{ lineIds: string[] }>;
  } catch {
    return { ok: false, code: 'NETWORK_ERROR', message: 'Keine Verbindung. Bitte versuche es erneut.' };
  } finally {
    clearTimeout(timer);
  }
}

// ---- Tasks ("Aufgaben") ------------------------------------------------------------------------

export interface TaskRow {
  id: string; proposal_id: string; title: string; description: string;
  acceptance_criteria: { id: string; text: string }[]; reward_amount: string; reward_asset: 'EURe' | 'EURC';
  deadline: string | null; status: TaskStatus; assignee_wallet: string | null; created_by_wallet: string; updated_at: string;
}
export interface ApplicationRow { id: string; applicant_wallet: string; note: string; status: string; created_at: string }
export type TaskAttachment = { type: 'image' | 'pdf' | 'tx'; url?: string; hash?: string };
export interface ActivityRow {
  id: string; actor_wallet: string; kind: string; body: string | null;
  attachments: TaskAttachment[]; from_status: string | null; to_status: string | null; created_at: string;
}
export interface VorhabenOverview {
  proposalUuid: string; stage: Stage; tasks: TaskRow[];
  wahlhelfer: { wallet: string; confirmed: boolean }[]; lineCount: number; totals: { asset: Asset; amount: number }[];
}
export interface TaskProposal { key: string; number: number; title: string; proposer: string; stage: Stage }
export interface TaskDetail { task: TaskRow; proposal: TaskProposal; applications: ApplicationRow[]; activity: ActivityRow[] }
export interface BoardGroup { proposal: { key: string; number: number; title: string; stage: Stage }; tasks: TaskRow[] }

const TASK_COLS = 'id, proposal_id, title, description, acceptance_criteria, reward_amount, reward_asset, deadline, status, assignee_wallet, created_by_wallet, updated_at';
// proposal_tasks has a single FK to proposals; pinned anyway so a later 2nd FK cannot break the embed (PGRST201).
const PROPOSAL_EMBED = 'proposals!proposal_tasks_proposal_id_fkey';

function toTask(r: any): TaskRow {
  const criteria = Array.isArray(r.acceptance_criteria) ? r.acceptance_criteria : [];
  return {
    id: r.id, proposal_id: r.proposal_id, title: r.title ?? '', description: r.description ?? '',
    acceptance_criteria: criteria
      .filter((c: any) => c && typeof c.text === 'string')
      .map((c: any, i: number) => ({ id: String(c.id ?? `k${i + 1}`), text: c.text })),
    reward_amount: String(r.reward_amount ?? '0'), reward_asset: r.reward_asset === 'EURC' ? 'EURC' : 'EURe',
    deadline: r.deadline ?? null, status: r.status, assignee_wallet: r.assignee_wallet ?? null,
    created_by_wallet: r.created_by_wallet ?? '', updated_at: r.updated_at ?? '',
  };
}

/** null when the proposal does not exist, has no Vorhaben, or the read fails. */
export function fetchVorhabenOverview(proposalKey: string): Promise<VorhabenOverview | null> {
  return soft(null, async () => {
    const p = await timed((signal) => supabase.from('proposals').select('id, lifecycle_stage, vorhaben_enabled').eq('proposal_id', proposalKey).abortSignal(signal).maybeSingle());
    const proposal = p.data as { id: string; lifecycle_stage: Stage; vorhaben_enabled: boolean } | null;
    if (p.error || !proposal || !proposal.vorhaben_enabled) return null;
    const [t, w, l] = await timed((signal) => Promise.all([
      supabase.from('proposal_tasks').select(TASK_COLS).eq('proposal_id', proposal.id).order('created_at', { ascending: true }).abortSignal(signal),
      supabase.from('proposal_wahlhelfer').select('attester_wallet, confirmed_at').eq('proposal_id', proposal.id).abortSignal(signal),
      supabase.from('proposal_payout_lines').select('amount, asset').eq('proposal_id', proposal.id).abortSignal(signal),
    ]));
    if (t.error) return null;
    const sums = new Map<Asset, number>();
    for (const line of (l.data ?? []) as { amount: string | number; asset: Asset }[]) {
      sums.set(line.asset, (sums.get(line.asset) ?? 0) + Number(line.amount));
    }
    return {
      proposalUuid: proposal.id,
      stage: proposal.lifecycle_stage,
      tasks: ((t.data ?? []) as any[]).map(toTask),
      wahlhelfer: ((w.data ?? []) as { attester_wallet: string; confirmed_at: string | null }[])
        .map((r) => ({ wallet: r.attester_wallet, confirmed: !!r.confirmed_at })),
      lineCount: (l.data ?? []).length,
      totals: [...sums.entries()].map(([asset, amount]) => ({ asset, amount })),
    };
  });
}

export async function fetchTaskDetail(taskId: string): Promise<TaskDetail | null> {
  const t = await timed((signal) => supabase.from('proposal_tasks')
    .select(`${TASK_COLS}, ${PROPOSAL_EMBED}(proposal_id, proposal_number, title, proposer_address, lifecycle_stage)`)
    .eq('id', taskId).abortSignal(signal).maybeSingle());
  if (t.error) throw new Error(t.error.message);
  const row = t.data as any;
  if (!row || !row.proposals) return null;
  const [a, act] = await timed((signal) => Promise.all([
    supabase.from('task_applications').select('id, applicant_wallet, note, status, created_at').eq('task_id', taskId).order('created_at', { ascending: true }).abortSignal(signal),
    supabase.from('task_activity').select('id, actor_wallet, kind, body, attachments, from_status, to_status, created_at').eq('task_id', taskId).order('created_at', { ascending: true }).abortSignal(signal),
  ]));
  if (a.error) throw new Error(a.error.message);
  if (act.error) throw new Error(act.error.message);
  const p = row.proposals;
  return {
    task: toTask(row),
    proposal: { key: p.proposal_id, number: p.proposal_number, title: p.title ?? '', proposer: (p.proposer_address ?? '').toLowerCase(), stage: p.lifecycle_stage },
    applications: (a.data ?? []) as ApplicationRow[],
    activity: ((act.data ?? []) as any[]).map((r) => ({ ...r, attachments: Array.isArray(r.attachments) ? r.attachments : [] })),
  };
}

/** Tasks assigned to `wallet` that still need something (not paid out, not cancelled). */
export function fetchMyTasks(wallet: string): Promise<(TaskRow & { proposalNumber: number })[]> {
  return soft([], async () => {
    const { data, error } = await timed((signal) => supabase.from('proposal_tasks')
      .select(`${TASK_COLS}, ${PROPOSAL_EMBED}(proposal_number)`)
      .eq('assignee_wallet', wallet.toLowerCase())
      .not('status', 'in', '(ausgezahlt,abgebrochen)')
      .order('updated_at', { ascending: false })
      .abortSignal(signal));
    if (error || !data) return [];
    return (data as any[]).map((r) => ({ ...toTask(r), proposalNumber: r.proposals?.proposal_number ?? 0 }));
  });
}

/** Every task, grouped by proposal (newest proposal first). Throws on a read failure. */
export async function fetchBoard(): Promise<BoardGroup[]> {
  const { data, error } = await timed((signal) => supabase.from('proposal_tasks')
    .select(`${TASK_COLS}, ${PROPOSAL_EMBED}(proposal_id, proposal_number, title, lifecycle_stage)`)
    .order('created_at', { ascending: true })
    .limit(500)
    .abortSignal(signal));
  if (error) throw new Error(error.message);
  const groups = new Map<string, BoardGroup>();
  for (const r of (data ?? []) as any[]) {
    const p = r.proposals;
    if (!p) continue;
    const g: BoardGroup = groups.get(r.proposal_id) ?? {
      proposal: { key: p.proposal_id, number: p.proposal_number, title: p.title ?? '', stage: p.lifecycle_stage }, tasks: [],
    };
    g.tasks.push(toTask(r));
    groups.set(r.proposal_id, g);
  }
  return [...groups.values()].sort((a, b) => b.proposal.number - a.proposal.number);
}

/** wallet (lowercase) → display name; "Unbekannt" when there is none. Never returns an address. */
export async function displayNames(wallets: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(wallets.filter(Boolean).map((w) => w.toLowerCase()))];
  const out = new Map(uniq.map((w) => [w, 'Unbekannt']));
  const valid = uniq.filter((w) => /^0x[0-9a-f]{40}$/.test(w));
  // users.wallet_address is not guaranteed lowercase (a few checksummed rows), so match case-insensitively.
  for (let i = 0; i < valid.length; i += 50) {
    const chunk = valid.slice(i, i + 50);
    let rows: { wallet_address: string; display_name: string | null; username: string | null }[];
    try {
      const { data, error } = await timed((signal) => supabase.from('users').select('wallet_address, display_name, username')
        .or(chunk.map((w) => `wallet_address.ilike.${w}`).join(','))
        .abortSignal(signal));
      if (error) continue;
      rows = (data ?? []) as typeof rows;
    } catch {
      continue; // names fall back to "Unbekannt"
    }
    for (const u of rows) {
      const name = u.display_name || u.username;
      if (name) out.set(u.wallet_address.toLowerCase(), name);
    }
  }
  return out;
}

/**
 * One task action. With `ctx` and a registered Nostr key on this device, the action is a kind-2101 event signed
 * with the person's own key (NSP-13 Stage 2, no wallet prompt); otherwise the legacy wallet-signed request.
 */
/** `feeRecorded`/`feeOpen`: payout_record_manual on a task reward line (was the platform fee in the same tx?). */
export type VorhabenActionData = { status?: string; id?: string; feeRecorded?: boolean; feeOpen?: boolean };

export async function vorhabenAction(
  account: SigningAccount, action: VorhabenAction, payload: Record<string, unknown>, ctx?: TaskEventContext,
): Promise<ApiResult<VorhabenActionData>> {
  if (ctx) {
    const outcome = await sendTaskActionEvent<VorhabenActionData>(account.address, action, payload, ctx);
    if (outcome.kind === 'done') return outcome.result;
    if (outcome.reason !== 'no identity or feature off' && outcome.reason !== 'not person-signable') {
      console.warn('[vorhaben] action via legacy request:', action, outcome.reason);
    }
  }
  return postSigned<VorhabenActionData>('/api/vorhaben/tasks', account, action, payload, VORHABEN_SCOPE);
}

export interface TaskPayoutLine { id: string; role: LineRole; amount: string; asset: Asset; rail: string; status: LineStatus }

/** Payout lines of one task (reward + platform fee); [] when none exist yet or the read fails (optional UI). */
export function fetchTaskPayoutLines(taskId: string): Promise<TaskPayoutLine[]> {
  return soft([], async () => {
    const { data, error } = await timed((signal) => supabase.from('proposal_payout_lines')
      .select('id, role, amount, asset, rail, status')
      .eq('reference_type', 'task').eq('reference_id', taskId).abortSignal(signal));
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((r) => ({ ...r, amount: String(r.amount) }) as TaskPayoutLine);
  });
}

// ---- Contract ("Vertrag") ----------------------------------------------------------------------

export type LineRole = 'empfaenger' | 'aufgabe' | 'wahlhelfer' | 'plattform';
export interface ContractLine {
  id: string; role: LineRole; recipientName: string; recipientWallet: string | null; amount: string; asset: Asset;
  status: LineStatus; txHash: string | null; referenceType: string; referenceId: string; createdAt: string;
  rail: string; purpose: string;
}
export interface ContractView {
  proposalKey: string; proposalNumber: number; title: string; stage: Stage; feeBps: number;
  lines: ContractLine[]; totals: { asset: Asset; amount: number }[];
}

/** Public payout contract of a proposal; null when the proposal does not exist. Throws on a read failure. */
export async function fetchContract(proposalKey: string): Promise<ContractView | null> {
  const p = await timed((signal) => supabase.from('proposals')
    .select('id, proposal_id, proposal_number, title, lifecycle_stage, beneficiary_name')
    .eq('proposal_id', proposalKey).abortSignal(signal).maybeSingle());
  if (p.error) throw new Error(p.error.message);
  const proposal = p.data as any;
  if (!proposal) return null;
  const [l, c, t] = await timed((signal) => Promise.all([
    supabase.from('proposal_payout_lines')
      .select('id, role, recipient_wallet, recipient_label, amount, asset, rail, reference_type, reference_id, status, tx_hash, created_at')
      .eq('proposal_id', proposal.id).order('created_at', { ascending: true }).abortSignal(signal),
    supabase.from('proposal_contracts').select('platform_fee_bps').eq('proposal_id', proposal.id).abortSignal(signal).maybeSingle(),
    supabase.from('proposal_tasks').select('id, title').eq('proposal_id', proposal.id).abortSignal(signal),
  ]));
  if (l.error) throw new Error(l.error.message);
  const rows = (l.data ?? []) as any[];
  const taskTitles = new Map<string, string>(((t.data ?? []) as { id: string; title: string }[]).map((r) => [r.id, r.title]));
  const names = await displayNames(rows.filter((r) => r.role !== 'plattform' && r.role !== 'empfaenger').map((r) => r.recipient_wallet ?? ''));
  const beneficiary: string = proposal.beneficiary_name ?? '';
  const lines: ContractLine[] = rows.map((r) => {
    const wallet: string | null = r.recipient_wallet ?? null;
    const recipientName = r.role === 'plattform' ? 'Plattform (Röbel App)'
      : r.role === 'empfaenger' ? (r.recipient_label || beneficiary || 'Unbekannt')
      : (wallet && names.get(wallet.toLowerCase()) !== 'Unbekannt' ? names.get(wallet.toLowerCase()) : null) || r.recipient_label || 'Unbekannt';
    return {
      id: r.id, role: r.role, recipientName, recipientWallet: wallet, amount: String(r.amount), asset: r.asset, status: r.status,
      txHash: r.tx_hash ?? null, referenceType: r.reference_type ?? '', referenceId: r.reference_id ?? '', createdAt: r.created_at ?? '',
      rail: r.rail ?? '', purpose: contractPurpose(r, taskTitles, beneficiary),
    };
  });
  const sums = new Map<Asset, number>();
  for (const x of lines) sums.set(x.asset, (sums.get(x.asset) ?? 0) + Number(x.amount));
  return {
    proposalKey: proposal.proposal_id, proposalNumber: proposal.proposal_number, title: proposal.title ?? '', stage: proposal.lifecycle_stage,
    feeBps: Number((c.data as any)?.platform_fee_bps ?? 500), lines,
    totals: [...sums.entries()].map(([asset, amount]) => ({ asset, amount })),
  };
}
