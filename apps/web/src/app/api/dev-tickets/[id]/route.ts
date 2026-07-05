import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/dev-tickets/api";
import {
  getTicket,
  updateTicket,
  deleteTicket,
  listActivity,
  addActivity,
  getFeedbackRow,
} from "@/lib/dev-tickets/db";
import type { DevTicket } from "@/types/dev-tickets";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  inbox: "Eingang",
  backlog: "Backlog",
  in_progress: "In Arbeit",
  in_review: "Review",
  done: "Fertig",
  rejected: "Abgelehnt",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const ticket = await getTicket(id);
    if (!ticket) return jsonError(new Error("Ticket nicht gefunden"), 404);
    const [activity, feedback] = await Promise.all([
      listActivity(id),
      ticket.source_feedback_id
        ? getFeedbackRow(ticket.source_feedback_id)
        : Promise.resolve(null),
    ]);
    return NextResponse.json({ ticket, activity, feedback });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const existing = await getTicket(id);
    if (!existing) return jsonError(new Error("Ticket nicht gefunden"), 404);
    const body = await req.json();
    const fields: Partial<DevTicket> = {};
    if (typeof body.title === "string" && body.title.trim())
      fields.title = body.title.trim().slice(0, 200);
    if (typeof body.description === "string")
      fields.description = body.description;
    if (["bug", "feature", "task", "improvement"].includes(body.type))
      fields.type = body.type;
    if (["low", "medium", "high", "urgent"].includes(body.priority))
      fields.priority = body.priority;
    if (
      ["inbox", "backlog", "in_progress", "in_review", "done", "rejected"].includes(
        body.status
      )
    )
      fields.status = body.status;
    if (typeof body.position === "number" && Number.isFinite(body.position))
      fields.position = body.position;
    if (!Object.keys(fields).length)
      return jsonError(new Error("Keine gültigen Felder"), 400);
    const ticket = await updateTicket(id, fields);
    if (fields.status && fields.status !== existing.status) {
      await addActivity(
        id,
        "admin",
        `Status: ${STATUS_LABELS[existing.status]} → ${STATUS_LABELS[fields.status]}`
      );
    }
    return NextResponse.json({ ticket });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    await deleteTicket(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
