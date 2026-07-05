import { NextResponse } from "next/server";
import { requireAdmin, jsonError, getParam } from "@/lib/dev-tickets/api";
import {
  listTickets,
  createTicket,
  addActivity,
  nextPositionFor,
} from "@/lib/dev-tickets/db";
import { ACTIVE_FIX_STATUSES } from "@/types/dev-tickets";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    let tickets = await listTickets();
    if (getParam(req, "sync") === "1") {
      const active = tickets.filter((t) =>
        ACTIVE_FIX_STATUSES.includes(t.fix_status)
      );
      if (active.length) {
        // sync.ts lands in Task 5; dynamic import keeps this route working
        // (sync silently skipped) until then.
        try {
          const { syncTicketGithub } = await import("@/lib/dev-tickets/sync");
          for (const t of active) {
            try {
              await syncTicketGithub(t);
            } catch (e) {
              console.error("[api/dev-tickets] sync failed", t.id, e);
            }
          }
          tickets = await listTickets();
        } catch {
          // sync module not present yet — return unsynced list
        }
      }
    }
    return NextResponse.json({ tickets });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return jsonError(new Error("Titel fehlt"), 400);
    const ticket = await createTicket({
      title: title.slice(0, 200),
      description:
        typeof body.description === "string" ? body.description : "",
      type: ["bug", "feature", "task", "improvement"].includes(body.type)
        ? body.type
        : "task",
      priority: ["low", "medium", "high", "urgent"].includes(body.priority)
        ? body.priority
        : "medium",
      // Manual tickets skip the AI inbox and go straight to Backlog.
      status: "backlog",
      source: "manual",
      position: await nextPositionFor("backlog"),
    });
    await addActivity(ticket.id, "admin", "Ticket manuell erstellt");
    return NextResponse.json({ ticket });
  } catch (e) {
    return jsonError(e);
  }
}
