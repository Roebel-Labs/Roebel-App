/**
 * "Wahlergebnis entschlüsseln": once a proposal's voting period is over, Attesters see a duty to
 * release their part of the election key. The in-app share submission follows after the key
 * ceremony; until then the flow runs as a walkthrough on the real proposal and nothing is sent.
 * The result is only shown once the real tally is published.
 */
import { supabase } from './supabase';

export interface DecryptDuty { proposalKey: string; proposalNumber: number; title: string; votingEndedAt: string }
export interface PublishedResult { forVotes: string; againstVotes: string; abstainVotes: string }

/** Voting ended within this window and the result is not yet published → the duty shows. */
const DUTY_WINDOW_MS = 30 * 86_400_000;
export const DECRYPT_STAGES = ['abstimmung', 'auszaehlung'];
const READ_TIMEOUT_MS = 15000;

async function read<T>(run: (signal: AbortSignal) => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const { data, error } = await run(controller.signal);
    return error ? null : data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * deadline_block holds the poll's end as unix seconds (MACI governor). Anything that does not look like
 * a timestamp (missing, zero, or a block-number-sized value) is unknown → never treated as ended.
 */
export const endMs = (deadline: string | number | null | undefined): number | null => {
  const n = Number(deadline);
  return Number.isFinite(n) && n >= 1_000_000_000 ? n * 1000 : null;
};

/** The decrypt duty shows ONLY once the voting period is over (and not longer than the duty window). */
export function isDecryptDue(deadline: string | number | null | undefined, nowMs: number): boolean {
  const end = endMs(deadline);
  return end !== null && nowMs >= end && nowMs - end < DUTY_WINDOW_MS;
}

export async function fetchDecryptDuties(nowMs = Date.now()): Promise<DecryptDuty[]> {
  const rows = await read<any[]>((signal) => supabase
    .from('proposals')
    .select('proposal_id, proposal_number, title, deadline_block, tally_confirm_opened_at')
    // The cron moves a proposal to 'auszaehlung' once voting ends; either stage still awaits the result.
    .in('lifecycle_stage', DECRYPT_STAGES)
    .is('tally_confirm_opened_at', null)
    .not('deadline_block', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)
    .abortSignal(signal));
  return (rows ?? [])
    .filter((r) => isDecryptDue(r.deadline_block, nowMs))
    .map((r) => ({
      proposalKey: r.proposal_id, proposalNumber: r.proposal_number, title: r.title,
      votingEndedAt: new Date(endMs(r.deadline_block)!).toISOString(),
    }));
}

export interface DecryptProposal extends DecryptDuty { result: PublishedResult | null; votingOpen: boolean }

/** The proposal behind the screen; `result` only once the tally is published. null = not found / read failed. */
export async function fetchDecryptProposal(proposalKey: string, nowMs = Date.now()): Promise<DecryptProposal | null> {
  const r = await read<any>((signal) => supabase
    .from('proposals')
    .select('proposal_id, proposal_number, title, deadline_block, tally_confirm_opened_at, for_votes, against_votes, abstain_votes')
    .eq('proposal_id', proposalKey)
    .abortSignal(signal)
    .maybeSingle());
  if (!r) return null;
  const end = endMs(r.deadline_block);
  return {
    proposalKey: r.proposal_id, proposalNumber: r.proposal_number, title: r.title,
    votingEndedAt: end ? new Date(end).toISOString() : '',
    votingOpen: end === null || end > nowMs,
    result: r.tally_confirm_opened_at
      ? { forVotes: String(r.for_votes ?? '0'), againstVotes: String(r.against_votes ?? '0'), abstainVotes: String(r.abstain_votes ?? '0') }
      : null,
  };
}

export const DECRYPT_REWARD_MUENZEN = 10;
