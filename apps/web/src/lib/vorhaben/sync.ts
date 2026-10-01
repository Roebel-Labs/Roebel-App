import { readProposalOutcome, type ContractReader } from "./chain";
import type { Stage } from "./constants";
import { notify } from "./notify";
import { planBudgetLines, planTaskLines } from "./payout-plan";
import { displayNames, ensureContract, insertLines, type ProposalRow } from "./repo";
import type { Db, VorhabenSettings } from "./settings";
import { deriveStage } from "./stage";

export interface SyncDeps {
  db: Db;
  reader: ContractReader;
  settings: VorhabenSettings;
  nowMs: () => number;
  listAttesters: (r: ContractReader) => Promise<string[]>;
}
export interface SyncResult { stage: Stage; openedWindow: boolean; newLines: number }

const DAY_MS = 86_400_000;
const ACCEPTED = new Set([4, 5, 7]);

export async function syncProposal(deps: SyncDeps, p: ProposalRow): Promise<SyncResult | null> {
  if (!p.vorhaben_enabled || !p.blockchain_proposal_id) return null;
  const { db, settings } = deps;
  const now = deps.nowMs();
  const nowIso = new Date(now).toISOString();
  const o = await readProposalOutcome(deps.reader, BigInt(p.blockchain_proposal_id));

  await db.from("proposals").update({
    state: o.state, for_votes: o.forVotes.toString(), against_votes: o.againstVotes.toString(),
    abstain_votes: o.abstainVotes.toString(), tally_address: o.tallyAddress, last_synced_at: nowIso,
  }).eq("id", p.id);

  const contract = await ensureContract(db, p.id, settings);
  const fee = { bps: contract.platform_fee_bps, platformSafe: contract.platform_safe_address, budgetFeeRail: settings.budgetFeeRail };
  let openedWindow = false;
  let newLines = 0;

  // Wahlhelfer window
  if (o.tallyPublished && !p.tally_confirm_opened_at) {
    // Fail closed: resolve the Attester list BEFORE opening the window so a failure retries next run.
    const attesters = await deps.listAttesters(deps.reader);
    const until = new Date(now + settings.windowDays * DAY_MS).toISOString();
    await db.from("proposals").update({ tally_confirm_opened_at: nowIso, tally_confirm_until: until }).eq("id", p.id);
    await db.from("proposal_wahlhelfer").upsert(
      attesters.map((w) => ({ proposal_id: p.id, attester_wallet: w })),
      { onConflict: "proposal_id,attester_wallet", ignoreDuplicates: true },
    );
    await notify(db, attesters.map((w) => ({
      wallet: w, kind: "vorhaben_tally" as const, screen: "auszaehlung" as const, proposalKey: p.proposal_id,
      title: "Auszählung bestätigen",
      body: `Vorschlag #${p.proposal_number} ist ausgezählt. Bitte bestätige das Ergebnis als Wahlhelfer:in.`,
    })));
    openedWindow = true;
  } else if (p.tally_confirm_opened_at && p.tally_confirm_until) {
    const opened = new Date(p.tally_confirm_opened_at).getTime();
    const until = new Date(p.tally_confirm_until).getTime();
    if (now - opened > 3 * DAY_MS && now < until) {
      const { data } = await db.from("proposal_wahlhelfer").select("id, attester_wallet")
        .eq("proposal_id", p.id).is("confirmed_at", null).is("reminded_at", null);
      const due = (data ?? []) as { id: string; attester_wallet: string }[];
      if (due.length) {
        await notify(db, due.map((d) => ({
          wallet: d.attester_wallet, kind: "vorhaben_tally" as const, screen: "auszaehlung" as const, proposalKey: p.proposal_id,
          title: "Erinnerung: Auszählung bestätigen",
          body: `Die Bestätigung für Vorschlag #${p.proposal_number} ist noch offen.`,
        })));
        for (const d of due) await db.from("proposal_wahlhelfer").update({ reminded_at: nowIso }).eq("id", d.id);
      }
    }
  }

  // Budget + approved task lines once accepted
  if (o.tallyPublished && ACCEPTED.has(o.state)) {
    if (p.budget_amount && p.budget_asset) {
      await insertLines(db, contract.id, p.id, planBudgetLines(
        { proposalId: p.id, beneficiary: p.beneficiary_name ?? "Empfänger", amount: String(p.budget_amount), asset: p.budget_asset }, fee));
      newLines += 2;
    }
    const { data: approved } = await db.from("proposal_tasks").select("id, assignee_wallet, reward_amount, reward_asset")
      .eq("proposal_id", p.id).eq("status", "abgenommen");
    const tasks = (approved ?? []) as { id: string; assignee_wallet: string; reward_amount: string; reward_asset: "EURe" | "EURC" }[];
    if (tasks.length) {
      const names = await displayNames(db, tasks.map((t) => t.assignee_wallet));
      for (const t of tasks) {
        await insertLines(db, contract.id, p.id, planTaskLines(
          { taskId: t.id, wallet: t.assignee_wallet, label: names.get(t.assignee_wallet) ?? "Unbekannt", amount: String(t.reward_amount), asset: t.reward_asset }, fee));
        newLines += 2;
      }
    }
  }

  // Stage
  const { data: taskRows } = await db.from("proposal_tasks").select("id, status").eq("proposal_id", p.id);
  const { data: lineRows } = await db.from("proposal_payout_lines").select("role, status").eq("proposal_id", p.id);
  const tasksNow = (taskRows ?? []) as { id: string; status: string }[];
  const linesNow = (lineRows ?? []) as { role: string; status: string }[];
  const stage = deriveStage({
    chainState: o.state, nowSec: Math.floor(now / 1000), deadlineSec: o.deadlineSec, tallyPublished: o.tallyPublished,
    taskStatuses: tasksNow.map((t) => t.status), lineStatuses: linesNow.map((l) => l.status),
    hasBudget: !!p.budget_amount, budgetLineConfirmed: linesNow.some((l) => l.role === "empfaenger" && l.status === "bestaetigt"),
  });

  if (stage === "abgelehnt") {
    for (const t of tasksNow.filter((x) => !["abgenommen", "ausgezahlt", "abgebrochen"].includes(x.status))) {
      await db.from("proposal_tasks").update({ status: "abgebrochen", updated_at: nowIso }).eq("id", t.id);
      await db.from("task_activity").insert({ task_id: t.id, actor_wallet: "system", kind: "status_change",
        body: "Vorschlag wurde abgelehnt.", from_status: t.status, to_status: "abgebrochen" });
    }
  }
  if (stage !== p.lifecycle_stage) {
    await db.from("proposals").update({ lifecycle_stage: stage }).eq("id", p.id);
    await db.from("proposal_stage_events").insert({ proposal_id: p.id, from_stage: p.lifecycle_stage, to_stage: stage });
  }
  return { stage, openedWindow, newLines };
}
