import type { Stage } from "./constants";

export interface StageInput {
  chainState: number;      // OZ ProposalState
  nowSec: number;
  deadlineSec: number;
  tallyPublished: boolean; // Tally.totalTallyResults() > 0
  taskStatuses: string[];
  lineStatuses: string[];
  hasBudget: boolean;
  budgetLineConfirmed: boolean;
}

const REJECTED = new Set([2, 3, 6]); // Canceled, Defeated, Expired
const ACCEPTED = new Set([4, 5, 7]); // Succeeded, Queued, Executed
const TASK_DONE = new Set(["ausgezahlt", "abgebrochen"]);

export function deriveStage(i: StageInput): Stage {
  if (i.nowSec < i.deadlineSec) return "abstimmung";
  if (REJECTED.has(i.chainState) && (i.tallyPublished || i.chainState !== 3)) return "abgelehnt";
  if (!i.tallyPublished || !ACCEPTED.has(i.chainState)) return "auszaehlung";
  if (i.taskStatuses.length === 0 && i.lineStatuses.length === 0 && !i.hasBudget) return "angenommen";
  const openTask = i.taskStatuses.some((s) => !TASK_DONE.has(s));
  const openLine = i.lineStatuses.some((s) => s !== "bestaetigt");
  const budgetOpen = i.hasBudget && !i.budgetLineConfirmed;
  return openTask || openLine || budgetOpen ? "in_umsetzung" : "umgesetzt";
}
