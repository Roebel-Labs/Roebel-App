// Reconciles a ticket's fix_status with live GitHub state (PR + workflow run).
// Called from the board's list polling and the detail sheet's github route.
import "server-only";
import {
  findPrForBranch,
  findTicketWorkflowRun,
  type PrInfo,
} from "@/lib/dev-tickets/github";
import { updateTicket, addActivity } from "@/lib/dev-tickets/db";
import { ACTIVE_FIX_STATUSES, type DevTicket } from "@/types/dev-tickets";

const FIX_TIMEOUT_MS = 30 * 60 * 1000; // spec: no PR after 30min = failed

export async function syncTicketGithub(ticket: DevTicket): Promise<DevTicket> {
  if (!ticket.github_branch) return ticket;
  if (!ACTIVE_FIX_STATUSES.includes(ticket.fix_status)) return ticket;

  const pr = await findPrForBranch(ticket.github_branch);

  if (pr) {
    if (pr.merged) {
      const updated = await updateTicket(ticket.id, {
        fix_status: "merged",
        status: "done",
        github_pr_number: pr.number,
        github_pr_url: pr.html_url,
      });
      await addActivity(ticket.id, "system", `PR #${pr.number} gemergt 🎉`);
      return updated;
    }
    if (pr.state === "closed") {
      const updated = await updateTicket(ticket.id, {
        fix_status: "failed",
        github_pr_number: pr.number,
        github_pr_url: pr.html_url,
      });
      await addActivity(
        ticket.id,
        "system",
        `PR #${pr.number} wurde ohne Merge geschlossen`
      );
      return updated;
    }
    if (ticket.fix_status !== "pr_open") {
      const updated = await updateTicket(ticket.id, {
        fix_status: "pr_open",
        status: ticket.status === "in_progress" ? "in_review" : ticket.status,
        github_pr_number: pr.number,
        github_pr_url: pr.html_url,
      });
      await addActivity(ticket.id, "system", `PR #${pr.number} geöffnet`);
      return updated;
    }
    return ticket;
  }

  // No PR yet — inspect the workflow run.
  const run = await findTicketWorkflowRun(ticket.id);
  if (run === "failure") {
    const updated = await updateTicket(ticket.id, { fix_status: "failed" });
    await addActivity(
      ticket.id,
      "system",
      "KI-Fix fehlgeschlagen (Workflow-Run ohne PR beendet) — Details im GitHub-Actions-Log"
    );
    return updated;
  }
  if (run === "in_progress" && ticket.fix_status === "queued") {
    return updateTicket(ticket.id, { fix_status: "running" });
  }
  // The run is still genuinely active — never apply the timeout while it's
  // in flight, or a late-arriving PR would be orphaned (fix_status='failed'
  // is outside ACTIVE_FIX_STATUSES).
  if (run === "in_progress" || run === "queued") {
    return ticket;
  }
  const dispatchedAt = ticket.fix_dispatched_at
    ? new Date(ticket.fix_dispatched_at).getTime()
    : 0;
  if (dispatchedAt && Date.now() - dispatchedAt > FIX_TIMEOUT_MS) {
    const updated = await updateTicket(ticket.id, { fix_status: "failed" });
    await addActivity(
      ticket.id,
      "system",
      "KI-Fix fehlgeschlagen (kein PR nach 30 Minuten)"
    );
    return updated;
  }
  return ticket;
}

export type { PrInfo };
