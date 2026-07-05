import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/dev-tickets/api";
import { getTicket, addActivity } from "@/lib/dev-tickets/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const ticket = await getTicket(id);
    if (!ticket) return jsonError(new Error("Ticket nicht gefunden"), 404);
    const body = await req.json();
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) return jsonError(new Error("Kommentar ist leer"), 400);
    await addActivity(id, "admin", text.slice(0, 4000));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
