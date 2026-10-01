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
export interface SyncResult { stage: Stage; openedWindow: boolean }

const DAY_MS = 86_400_000;
const ACCEPTED = new Set([4, 5, 7]);

function check(r: { error: { message: string } | null }, what: string): void {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
}
function rows<T>(r: { data: unknown; error: { message: string } | null }, what: string): T[] {
  check(r, what);
  return (r.data ?? []) as T[];
}

export async function syncProposal(deps: SyncDeps, p: ProposalRow): Promise<SyncResult | null> {
  if (!p.vorhaben_enabled || !p.blockchain_proposal_id) return null;
  const { db, settings } = deps;
  const now = deps.nowMs();
  const nowIso = new Date(now).toISOString();
  const o = await readProposalOutcome(deps.reader, BigInt(p.blockchain_proposal_id));

  check(await db.from("proposals").update({
    state: o.state, for_votes: o.forVotes.toString(), against_votes: o.againstVotes.toString(),
    abstain_votes: o.abstainVotes.toString(), tally_address: o.tallyAddress, last_synced_at: nowIso,
  }).eq("id", p.id), "mirror update");

  const contract = await ensureContract(db, p.id, settings);
  const fee = { bps: contract.platform_fee_bps, platformSafe: contract.platform_safe_address, budgetFeeRail: settings.budgetFeeRail };
  let openedWindow = false;

  // Wahlhelfer window. Order: attesters -> idempotent snapshot -> open window -> notify, so any failure retries next run.
  if (o.tallyPublished && !p.tally_confirm_opened_at) {
    const attesters = await deps.listAttesters(deps.reader);
    check(await db.from("proposal_wahlhelfer").upsert(
      attesters.map((w) => ({ proposal_id: p.id, attester_wallet: w })),
      { onConflict: "proposal_id,attester_wallet", ignoreDuplicates: true },
    ), "wahlhelfer snapshot");
    const until = new Date(now + settings.windowDays * DAY_MS).toISOString();
    check(await db.from("proposals").update({ tally_confirm_opened_at: nowIso, tally_confirm_until: until }).eq("id", p.id), "open window");
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
      const due = rows<{ id: string; attester_wallet: string }>(
        await db.from("proposal_wahlhelfer").select("id, attester_wallet")
          .eq("proposal_id", p.id).is("confirmed_at", null).is("reminded_at", null), "reminder read");
      if (due.length) {
        check(await db.from("proposal_wahlhelfer").update({ reminded_at: nowIso }).in("id", due.map((d) => d.id)), "reminder mark");
        await notify(db, due.map((d) => ({
          wallet: d.attester_wallet, kind: "vorhaben_tally" as const, screen: "auszaehlung" as const, proposalKey: p.proposal_id,
          title: "Erinnerung: Auszählung bestätigen",
          body: `Die Bestätigung für Vorschlag #${p.proposal_number} ist noch offen.`,
        })));
      }
    }
  }

  // Budget + approved task lines once accepted
  if (o.tallyPublished && ACCEPTED.has(o.state)) {
    if (p.budget_amount && p.budget_asset) {
      await insertLines(db, contract.id, p.id, planBudgetLines(
        { proposalId: p.id, beneficiary: p.beneficiary_name ?? "Empfänger", amount: String(p.budget_amount), asset: p.budget_asset }, fee));
    }
    const tasks = rows<{ id: string; assignee_wallet: string; reward_amount: string; reward_asset: "EURe" | "EURC" }>(
      await db.from("proposal_tasks").select("id, assignee_wallet, reward_amount, reward_asset")
        .eq("proposal_id", p.id).eq("status", "abgenommen"), "approved tasks read");
    if (tasks.length) {
      const names = await displayNames(db, tasks.map((t) => t.assignee_wallet));
      for (const t of tasks) {
        await insertLines(db, contract.id, p.id, planTaskLines(
          { taskId: t.id, wallet: t.assignee_wallet, label: names.get(t.assignee_wallet.toLowerCase()) ?? "Unbekannt", amount: String(t.reward_amount), asset: t.reward_asset }, fee));
      }
    }
  }

  // Stage
  const tasksNow = rows<{ id: string; status: string }>(await db.from("proposal_tasks").select("id, status").eq("proposal_id", p.id), "tasks read");
  const linesNow = rows<{ role: string; status: string }>(await db.from("proposal_payout_lines").select("role, status").eq("proposal_id", p.id), "lines read");
  const stage = deriveStage({
    chainState: o.state, nowSec: Math.floor(now / 1000), deadlineSec: o.deadlineSec, tallyPublished: o.tallyPublished,
    taskStatuses: tasksNow.map((t) => t.status), lineStatuses: linesNow.map((l) => l.status),
    hasBudget: !!p.budget_amount, budgetLineConfirmed: linesNow.some((l) => l.role === "empfaenger" && l.status === "bestaetigt"),
  });

  if (stage === "abgelehnt") {
    for (const t of tasksNow.filter((x) => !["abgenommen", "ausgezahlt", "abgebrochen"].includes(x.status))) {
      check(await db.from("proposal_tasks").update({ status: "abgebrochen", updated_at: nowIso }).eq("id", t.id), `cancel task ${t.id}`);
      check(await db.from("task_activity").insert({ task_id: t.id, actor_wallet: "system", kind: "status_change",
        body: "Vorschlag wurde abgelehnt.", from_status: t.status, to_status: "abgebrochen" }), `task activity ${t.id}`);
    }
  }
  if (stage !== p.lifecycle_stage) {
    check(await db.from("proposals").update({ lifecycle_stage: stage }).eq("id", p.id), "stage update");
    check(await db.from("proposal_stage_events").insert({ proposal_id: p.id, from_stage: p.lifecycle_stage, to_stage: stage }), "stage event");
  }
  return { stage, openedWindow };
}
