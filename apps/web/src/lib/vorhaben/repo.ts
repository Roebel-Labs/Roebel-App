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
  recipient_label: string;
  /** Decimal string — always normalised by toLineRow (PostgREST sends numeric as a JSON number). */
  amount: string; asset: Asset; rail: Rail; reference_type: string; reference_id: string;
  status: LineStatus; error: string | null; attempt_started_at: string | null; safe_tx_hash: string | null;
  safe_nonce: number | null; tx_hash: string | null; updated_at?: string | null;
};

/**
 * PostgREST returns `numeric` columns as JSON numbers. Every money amount is handled as a decimal
 * string downstream, so normalise once here (no exponent notation, at most 18 decimals).
 */
export function amountString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) {
    const s = String(v);
    return /e/i.test(s) ? v.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 18 }) : s;
  }
  if (typeof v === "bigint") return v.toString();
  throw new Error(`invalid amount: ${String(v)}`);
}

/** The single mapper for every proposal_payout_lines read typed as LineRow. */
export function toLineRow(raw: unknown): LineRow {
  const r = raw as LineRow;
  return { ...r, amount: amountString((raw as { amount: unknown }).amount) };
}
export function toLineRows(data: unknown): LineRow[] {
  return ((data ?? []) as unknown[]).map(toLineRow);
}

const PROPOSAL_COLS =
  "id, proposal_id, proposal_number, title, proposer_address, blockchain_proposal_id, vorhaben_enabled, budget_amount, " +
  "budget_asset, beneficiary_name, lifecycle_stage, tally_confirm_opened_at, tally_confirm_until, tally_address";
const LINE_COLS =
  "id, contract_id, proposal_id, role, recipient_wallet, recipient_label, amount, asset, rail, reference_type, reference_id, " +
  "status, error, attempt_started_at, safe_tx_hash, safe_nonce, tx_hash, updated_at";

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

export async function listActiveProposals(db: Db): Promise<ProposalRow[]> {
  const rows = must(await db.from("proposals").select(PROPOSAL_COLS).eq("vorhaben_enabled", true), "proposals") as unknown as ProposalRow[];
  const open = must(await db.from("proposal_payout_lines").select("proposal_id").neq("status", "bestaetigt"), "open lines") as { proposal_id: string }[];
  const withOpen = new Set(open.map((l) => l.proposal_id));
  const now = Date.now();
  return rows.filter((p) => isActiveProposal(p, withOpen.has(p.id), now));
}

/** Active = still in progress, has open payout lines, or its confirmation window is still open. */
export function isActiveProposal(
  p: Pick<ProposalRow, "lifecycle_stage" | "tally_confirm_until">, hasOpenLines: boolean, nowMs: number,
): boolean {
  if (!["umgesetzt", "abgelehnt"].includes(p.lifecycle_stage)) return true;
  if (hasOpenLines) return true;
  return !!p.tally_confirm_until && new Date(p.tally_confirm_until).getTime() > nowMs;
}

export async function getProposal(db: Db, id: string): Promise<ProposalRow | null> {
  return must(await db.from("proposals").select(PROPOSAL_COLS).eq("id", id).maybeSingle(), "proposal") as unknown as ProposalRow | null;
}

export async function ensureContract(db: Db, proposalId: string, s: VorhabenSettings) {
  const { error } = await db.from("proposal_contracts").upsert(
    { proposal_id: proposalId, platform_fee_bps: s.platformFeeBps, platform_safe_address: s.platformSafe },
    { onConflict: "proposal_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`ensure contract for ${proposalId}: ${error.message}`);
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
  return toLineRows(must(await db.from("proposal_payout_lines").select(LINE_COLS).eq("proposal_id", proposalId), "lines"));
}

export async function openLines(db: Db): Promise<LineRow[]> {
  return toLineRows(must(await db.from("proposal_payout_lines").select(LINE_COLS).neq("status", "bestaetigt").order("created_at"), "open lines"));
}

export async function updateLine(db: Db, id: string, patch: Partial<LineRow>): Promise<void> {
  const { error } = await db.from("proposal_payout_lines").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`update line ${id}: ${error.message}`);
}

export async function displayNames(db: Db, wallets: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(wallets.map((w) => w.toLowerCase()))];
  const out = new Map(uniq.map((w) => [w, "Unbekannt"]));
  const valid = uniq.filter((w) => /^0x[0-9a-f]{40}$/.test(w));
  // users.wallet_address is not guaranteed lowercase in prod (2 checksummed rows), so match case-insensitively.
  for (let i = 0; i < valid.length; i += 50) {
    const chunk = valid.slice(i, i + 50);
    const { data, error } = await db.from("users").select("wallet_address, display_name, username")
      .or(chunk.map((w) => `wallet_address.ilike.${w}`).join(","));
    if (error) throw new Error(`display names: ${error.message}`);
    for (const u of (data ?? []) as { wallet_address: string; display_name: string | null; username: string | null }[]) {
      const name = u.display_name || u.username;
      if (name) out.set(u.wallet_address.toLowerCase(), name);
    }
  }
  return out;
}
