import type { Asset, LineRole, LineStatus, Rail, Stage } from "./constants";
import type { LineDraft } from "./payout-plan";
import type { Db, VorhabenSettings } from "./settings";

export type ProposalRow = {
  id: string; proposal_id: string; proposal_number: number; title: string; proposer_address: string;
  blockchain_proposal_id: string | null; vorhaben_enabled: boolean; budget_amount: string | null;
  budget_asset: Asset | null; beneficiary_name: string | null; lifecycle_stage: Stage;
  tally_confirm_opened_at: string | null; tally_confirm_until: string | null; tally_address: string | null;
};
export type LineRow = {
  id: string; contract_id: string; proposal_id: string; role: LineRole; recipient_wallet: string | null;
  recipient_label: string; amount: string; asset: Asset; rail: Rail; reference_type: string; reference_id: string;
  status: LineStatus; error: string | null; attempt_started_at: string | null; safe_tx_hash: string | null;
  safe_nonce: number | null; tx_hash: string | null;
};

const PROPOSAL_COLS =
  "id, proposal_id, proposal_number, title, proposer_address, blockchain_proposal_id, vorhaben_enabled, budget_amount, " +
  "budget_asset, beneficiary_name, lifecycle_stage, tally_confirm_opened_at, tally_confirm_until, tally_address";
const LINE_COLS =
  "id, contract_id, proposal_id, role, recipient_wallet, recipient_label, amount, asset, rail, reference_type, reference_id, " +
  "status, error, attempt_started_at, safe_tx_hash, safe_nonce, tx_hash";

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

export async function listActiveProposals(db: Db): Promise<ProposalRow[]> {
  const rows = must(await db.from("proposals").select(PROPOSAL_COLS).eq("vorhaben_enabled", true), "proposals") as unknown as ProposalRow[];
  const open = must(await db.from("proposal_payout_lines").select("proposal_id").neq("status", "bestaetigt"), "open lines") as { proposal_id: string }[];
  const withOpen = new Set(open.map((l) => l.proposal_id));
  return rows.filter((p) => !["umgesetzt", "abgelehnt"].includes(p.lifecycle_stage) || withOpen.has(p.id) || !p.tally_confirm_until || new Date(p.tally_confirm_until).getTime() > Date.now());
}

export async function getProposal(db: Db, id: string): Promise<ProposalRow | null> {
  return must(await db.from("proposals").select(PROPOSAL_COLS).eq("id", id).maybeSingle(), "proposal") as unknown as ProposalRow | null;
}

export async function ensureContract(db: Db, proposalId: string, s: VorhabenSettings) {
  await db.from("proposal_contracts").upsert(
    { proposal_id: proposalId, platform_fee_bps: s.platformFeeBps, platform_safe_address: s.platformSafe },
    { onConflict: "proposal_id", ignoreDuplicates: true },
  );
  return must(await db.from("proposal_contracts").select("id, platform_fee_bps, platform_safe_address").eq("proposal_id", proposalId).single(), "contract") as
    { id: string; platform_fee_bps: number; platform_safe_address: string };
}

export async function insertLines(db: Db, contractId: string, proposalId: string, drafts: LineDraft[]): Promise<void> {
  if (drafts.length === 0) return;
  const rows = drafts.map((d) => ({ ...d, contract_id: contractId, proposal_id: proposalId }));
  const { error } = await db.from("proposal_payout_lines").upsert(rows, { onConflict: "role,reference_type,reference_id", ignoreDuplicates: true });
  if (error) throw new Error(`insert lines: ${error.message}`);
}

export async function linesForProposal(db: Db, proposalId: string): Promise<LineRow[]> {
  return must(await db.from("proposal_payout_lines").select(LINE_COLS).eq("proposal_id", proposalId), "lines") as unknown as LineRow[];
}

export async function openLines(db: Db): Promise<LineRow[]> {
  return must(await db.from("proposal_payout_lines").select(LINE_COLS).neq("status", "bestaetigt").order("created_at"), "open lines") as unknown as LineRow[];
}

export async function updateLine(db: Db, id: string, patch: Partial<LineRow>): Promise<void> {
  const { error } = await db.from("proposal_payout_lines").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`update line ${id}: ${error.message}`);
}

export async function displayNames(db: Db, wallets: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(wallets.map((w) => w.toLowerCase()))];
  const out = new Map(uniq.map((w) => [w, "Unbekannt"]));
  if (uniq.length === 0) return out;
  // users.wallet_address is not guaranteed lowercase in prod (2 checksummed rows), so match case-insensitively.
  const { data } = await db.from("users").select("wallet_address, display_name, username")
    .or(uniq.map((w) => `wallet_address.ilike.${w}`).join(","));
  for (const u of (data ?? []) as { wallet_address: string; display_name: string | null; username: string | null }[]) {
    const name = u.display_name || u.username;
    if (name) out.set(u.wallet_address.toLowerCase(), name);
  }
  return out;
}
