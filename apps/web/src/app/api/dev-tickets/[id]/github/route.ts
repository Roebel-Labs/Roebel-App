import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/dev-tickets/api";
import { getTicket } from "@/lib/dev-tickets/db";
import { syncTicketGithub } from "@/lib/dev-tickets/sync";
import { findPrForBranch, getCiStatus } from "@/lib/dev-tickets/github";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    let ticket = await getTicket(id);
    if (!ticket) return jsonError(new Error("Ticket nicht gefunden"), 404);
    ticket = await syncTicketGithub(ticket);
    let pr = null;
    let ci = null;
    if (ticket.github_branch && ticket.github_pr_number) {
      pr = await findPrForBranch(ticket.github_branch);
      if (pr) ci = await getCiStatus(pr.head_sha);
    }
    const canMerge =
      !!pr &&
      pr.state === "open" &&
      !pr.merged &&
      pr.mergeable_state === "clean" &&
      ci === "success";
    return NextResponse.json({ ticket, pr, ci, canMerge });
  } catch (e) {
    return jsonError(e);
  }
}
