// Proposal lifecycle data for the app. Reads go straight to Supabase (public tables);
// writes go to the web API (apps/web/src/app/api/vorhaben/*).
import { supabase } from './supabase';
import { getApiBaseUrl, signQueued, type ApiResult, type SigningAccount } from './signed-request';
import type { Asset } from './vorhaben-labels';

export interface TallyDuty { proposalUuid: string; proposalKey: string; proposalNumber: number; title: string; until: string }
export interface TallyView {
  proposalId: string; proposalNumber: number; title: string; message: string;
  forVotes: string; againstVotes: string; abstainVotes: string; tallyAddress: string; until: string;
  eligible: boolean; confirmedAt: string | null; reward: { amount: string; asset: Asset };
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
  const { data, error } = await supabase.from('proposals').select('id').eq('proposal_id', proposalKey).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id: string } | null)?.id ?? null;
}

export async function fetchOpenTallyDuties(wallet: string): Promise<TallyDuty[]> {
  const { data, error } = await supabase
    .from('proposal_wahlhelfer')
    .select('proposal_id, proposals!inner(proposal_id, proposal_number, title, tally_confirm_until)')
    .eq('attester_wallet', wallet.toLowerCase())
    .is('confirmed_at', null);
  if (error || !data) return [];
  const now = Date.now();
  return (data as any[])
    .map((r) => ({ proposalUuid: r.proposal_id, proposalKey: r.proposals.proposal_id, proposalNumber: r.proposals.proposal_number,
      title: r.proposals.title, until: r.proposals.tally_confirm_until }))
    .filter((d) => d.until && new Date(d.until).getTime() > now);
}

export function fetchTallyView(proposalUuid: string, wallet: string): Promise<ApiResult<TallyView>> {
  return getJson<TallyView>(`/api/vorhaben/tally-confirm?proposalId=${proposalUuid}&wallet=${wallet.toLowerCase()}`);
}

export async function submitTally(account: SigningAccount, proposalUuid: string, message: string): Promise<ApiResult<{ lineIds: string[] }>> {
  let signature: string;
  try {
    signature = await signQueued(account, message);
  } catch {
    return { ok: false, code: 'SIGN_FAILED', message: 'Signatur abgebrochen oder fehlgeschlagen.' };
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
