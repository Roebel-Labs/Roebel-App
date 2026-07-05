import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/dev-tickets/api";
import { getTicket, updateTicket, addActivity } from "@/lib/dev-tickets/db";
import { buildBranchName, dispatchTicketFix } from "@/lib/dev-tickets/github";
import type { DevTicketAiAnalysis } from "@/types/dev-tickets";

export const dynamic = "force-dynamic";

function renderInstructions(
  description: string,
  analysis: DevTicketAiAnalysis | null
): string {
  const parts = [description.trim()];
  if (analysis?.repro_steps?.length) {
    parts.push(
      "## Schritte zur Reproduktion\n" +
        analysis.repro_steps.map((s, i) => `${i + 1}. ${s}`).join("\n")
    );
  }
  if (analysis?.suspected_area) {
    parts.push(`## Vermuteter Bereich\n${analysis.suspected_area}`);
  }
  if (analysis?.severity_rationale) {
    parts.push(`## Schweregrad\n${analysis.severity_rationale}`);
  }
  return parts.filter(Boolean).join("\n\n");
}

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
    if (!["none", "failed"].includes(ticket.fix_status)) {
      return jsonError(new Error("Für dieses Ticket läuft bereits ein Fix"), 409);
    }
    if (["done", "rejected"].includes(ticket.status)) {
      return jsonError(
        new Error("Abgeschlossene/abgelehnte Tickets können nicht gefixt werden"),
        409
      );
    }
    const branch = buildBranchName(ticket.id, ticket.title);
    await dispatchTicketFix({
      ticketId: ticket.id,
      title: ticket.title,
      branch,
      instructions: renderInstructions(ticket.description, ticket.ai_analysis),
    });
    await updateTicket(id, {
      fix_status: "queued",
      github_branch: branch,
      status: "in_progress",
      fix_dispatched_at: new Date().toISOString(),
    });
    await addActivity(id, "system", `KI-Fix gestartet — Branch \`${branch}\``);
    return NextResponse.json({ ok: true, branch });
  } catch (e) {
    return jsonError(e);
  }
}
