import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/dev-tickets/api";
import { getTicket, updateTicket, addActivity } from "@/lib/dev-tickets/db";
import {
  findPrForBranch,
  getCiStatus,
  mergePr,
} from "@/lib/dev-tickets/github";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const ticket = await getTicket(id);
    if (!ticket) return jsonError(new Error("Ticket nicht gefunden"), 404);
    if (!ticket.github_branch || !ticket.github_pr_number) {
      return jsonError(new Error("Kein PR für dieses Ticket"), 409);
    }
    const pr = await findPrForBranch(ticket.github_branch);
    if (!pr || pr.state !== "open" || pr.merged) {
      return jsonError(new Error("PR ist nicht offen"), 409);
    }
    if (pr.mergeable_state !== "clean") {
      return jsonError(
        new Error(`PR nicht mergebar (Status: ${pr.mergeable_state})`),
        409
      );
    }
    const ci = await getCiStatus(pr.head_sha);
    if (ci !== "success") {
      return jsonError(new Error(`CI ist nicht grün (Status: ${ci})`), 409);
    }
    await mergePr(pr.number);
    const updated = await updateTicket(id, {
      fix_status: "merged",
      status: "done",
    });
    await addActivity(
      id,
      "admin",
      `PR #${pr.number} nach menschlicher Prüfung gemergt (squash)`
    );
    return NextResponse.json({ ticket: updated });
  } catch (e) {
    return jsonError(e);
  }
}
