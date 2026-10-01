import { readProposalOutcome, type ContractReader } from "./chain";
import type { Asset } from "./constants";
import { planWahlhelferLines } from "./payout-plan";
import { displayNames, ensureContract, insertLines, type ProposalRow } from "./repo";
import type { Db, VorhabenSettings } from "./settings";
import { buildTallyConfirmMessage, tallyResultHash, type TallyFacts } from "./tally-message";

export interface TallyView {
  proposalId: string; proposalNumber: number; title: string; message: string;
  forVotes: string; againstVotes: string; abstainVotes: string; tallyAddress: string; until: string;
  eligible: boolean; confirmedAt: string | null; reward: { amount: string; asset: Asset };
}
export interface TallyDeps {
  db: Db; reader: ContractReader; settings: VorhabenSettings; nowMs: () => number;
  verify: (wallet: string, message: string, signature: string) => Promise<boolean>;
  dispatch: (lineIds: string[]) => Promise<void>;
}
type Fail = { ok: false; status: number; code: string; message: string };
const fail = (status: number, code: string, message: string): Fail => ({ ok: false, status, code, message });

async function loadFacts(deps: TallyDeps, proposalUuid: string): Promise<{ p: ProposalRow; facts: TallyFacts } | Fail> {
  const { data, error } = await deps.db.from("proposals").select("*").eq("id", proposalUuid).maybeSingle();
  if (error) throw new Error(`proposal: ${error.message}`);
  const p = data as ProposalRow | null;
  if (!p || !p.vorhaben_enabled || !p.blockchain_proposal_id) return fail(404, "NOT_FOUND", "Vorschlag nicht gefunden.");
  if (!p.tally_confirm_until) return fail(409, "NOT_OPEN", "Die Auszählung ist noch nicht veröffentlicht.");
  const o = await readProposalOutcome(deps.reader, BigInt(p.blockchain_proposal_id));
  if (!o.tallyPublished || !o.tallyAddress) return fail(409, "NOT_OPEN", "Die Auszählung ist noch nicht veröffentlicht.");
  return { p, facts: { proposalId: BigInt(p.blockchain_proposal_id), proposalNumber: p.proposal_number, title: p.title,
    forVotes: o.forVotes, againstVotes: o.againstVotes, abstainVotes: o.abstainVotes, tallyAddress: o.tallyAddress } };
}

export async function getTallyView(deps: TallyDeps, proposalUuid: string, wallet: string): Promise<TallyView | { error: string; status: number }> {
  const loaded = await loadFacts(deps, proposalUuid);
  if ("ok" in loaded) return { error: loaded.message, status: loaded.status };
  const { p, facts } = loaded;
  const { data, error } = await deps.db.from("proposal_wahlhelfer").select("id, confirmed_at")
    .eq("proposal_id", p.id).eq("attester_wallet", wallet.toLowerCase()).maybeSingle();
  if (error) throw new Error(`wahlhelfer: ${error.message}`);
  const row = data as { id: string; confirmed_at: string | null } | null;
  return {
    proposalId: p.id, proposalNumber: p.proposal_number, title: p.title, message: buildTallyConfirmMessage(facts),
    forVotes: facts.forVotes.toString(), againstVotes: facts.againstVotes.toString(), abstainVotes: facts.abstainVotes.toString(),
    tallyAddress: facts.tallyAddress, until: p.tally_confirm_until!, eligible: !!row, confirmedAt: row?.confirmed_at ?? null,
    reward: { amount: deps.settings.wahlhelferAmount, asset: deps.settings.wahlhelferAsset },
  };
}

export async function submitTallyConfirmation(deps: TallyDeps, proposalUuid: string, walletIn: string, signature: string):
  Promise<{ ok: true; lineIds: string[] } | Fail> {
  const wallet = walletIn.toLowerCase();
  const loaded = await loadFacts(deps, proposalUuid);
  if ("ok" in loaded) return loaded;
  const { p, facts } = loaded;
  if (new Date(p.tally_confirm_until!).getTime() <= deps.nowMs()) return fail(409, "WINDOW_CLOSED", "Die Bestätigungsfrist ist abgelaufen.");

  const { data, error: rowErr } = await deps.db.from("proposal_wahlhelfer").select("id, attester_wallet, confirmed_at")
    .eq("proposal_id", p.id).eq("attester_wallet", wallet).maybeSingle();
  if (rowErr) throw new Error(`wahlhelfer: ${rowErr.message}`);
  const row = data as { id: string; confirmed_at: string | null } | null;
  if (!row) return fail(403, "NOT_ELIGIBLE", "Du bist für diese Auszählung nicht als Wahlhelfer:in eingetragen.");
  if (row.confirmed_at) return fail(409, "ALREADY_CONFIRMED", "Du hast bereits bestätigt.");

  const message = buildTallyConfirmMessage(facts);
  if (!(await deps.verify(wallet, message, signature))) return fail(401, "BAD_SIGNATURE", "Die Signatur passt nicht zum Ergebnis.");

  const { data: won, error: wonErr } = await deps.db.from("proposal_wahlhelfer")
    .update({ message, result_hash: tallyResultHash(facts), signature, confirmed_at: new Date(deps.nowMs()).toISOString() })
    .eq("id", row.id).is("confirmed_at", null).select("id");
  if (wonErr) throw new Error(`confirm update: ${wonErr.message}`);
  if (!won || (won as unknown[]).length === 0) return fail(409, "ALREADY_CONFIRMED", "Du hast bereits bestätigt.");

  const contract = await ensureContract(deps.db, p.id, deps.settings);
  const names = await displayNames(deps.db, [wallet]);
  const drafts = planWahlhelferLines(
    { wahlhelferId: row.id, wallet, label: names.get(wallet) ?? "Unbekannt", amount: deps.settings.wahlhelferAmount, asset: deps.settings.wahlhelferAsset },
    { bps: contract.platform_fee_bps, platformSafe: contract.platform_safe_address, budgetFeeRail: deps.settings.budgetFeeRail });
  await insertLines(deps.db, contract.id, p.id, drafts);

  const { data: lineRows, error: lineErr } = await deps.db.from("proposal_payout_lines").select("id")
    .eq("reference_type", "wahlhelfer").eq("reference_id", row.id);
  if (lineErr) throw new Error(`lines: ${lineErr.message}`);
  const lineIds = ((lineRows ?? []) as { id: string }[]).map((l) => l.id);
  if (deps.settings.dispatchEnabled && lineIds.length) {
    // The confirmation and lines are stored; a dispatch failure must not undo that. The cron retries open lines.
    try { await deps.dispatch(lineIds); } catch (e) { console.error("[vorhaben/tally] dispatch failed", e); }
  }
  return { ok: true, lineIds };
}
