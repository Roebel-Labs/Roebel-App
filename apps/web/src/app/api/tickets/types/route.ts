import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount, canManage } from "@/lib/tickets/authz";
import { connectedAccountRow } from "@/lib/tickets/connect-status";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TicketTypeInput = {
  id?: string; name: string; description?: string | null; price_cents: number; capacity?: number | null;
  per_order_max?: number; sales_end?: string | null; sort_order?: number; is_active?: boolean;
};

function clean(t: unknown, i: number): TicketTypeInput | string {
  const x = (t ?? {}) as Record<string, unknown>;
  const name = String(x.name ?? "").trim();
  if (name.length < 1 || name.length > 80) return `Name fehlt (Ticket ${i + 1})`;
  const price = Number(x.price_cents);
  if (!Number.isInteger(price) || price < 0 || price > 100000) return `Preis ungültig (${name})`;
  if (price > 0 && price < 50) return `Mindestpreis 0,50 € (${name})`;
  const capacity = x.capacity == null || x.capacity === "" ? null : Number(x.capacity);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) return `Kontingent ungültig (${name})`;
  const perOrder = x.per_order_max == null ? 10 : Number(x.per_order_max);
  if (!Number.isInteger(perOrder) || perOrder < 1 || perOrder > 50) return `Max. pro Bestellung ungültig (${name})`;
  const id = typeof x.id === "string" && UUID_RE.test(x.id) ? x.id : undefined;
  const salesEnd = typeof x.sales_end === "string" && !Number.isNaN(Date.parse(x.sales_end)) ? x.sales_end : null;
  return {
    id, name, description: typeof x.description === "string" ? x.description.slice(0, 500) : null, price_cents: price,
    capacity, per_order_max: perOrder, sales_end: salesEnd, sort_order: Number.isInteger(x.sort_order) ? Number(x.sort_order) : i,
    is_active: x.is_active !== false,
  };
}

// POST signed, two actions behind the same owner/admin check:
//   ticket_types_upsert { event_id, types } → { types }  (write)
//   ticket_types_list   { event_id }        → { types }  (read, includes inactive rows)
export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["ticket_types_upsert", "ticket_types_list"] });
  if (!v.ok) return failResponse(v);
  const eventId = String(v.payload.event_id ?? "");
  if (!UUID_RE.test(eventId)) return jsonFail(400, "BAD_REQUEST", "event_id fehlt");

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("id, account_id").eq("id", eventId).maybeSingle();
  if (!event?.account_id) return jsonFail(404, "NOT_FOUND", "Veranstaltung gehört keiner Organisation");
  if (!canManage(await roleInAccount(admin, event.account_id, v.wallet))) return jsonFail(403, "FORBIDDEN", "Nur Inhaber oder Admins.");

  // The org editor reads through the service role: the anon policy only exposes is_active rows,
  // so a deactivated ticket type would silently disappear from the editor and be re-created on save.
  if (v.action === "ticket_types_list") {
    const { data: all, error } = await admin.from("ticket_types").select("*").eq("event_id", eventId).order("sort_order");
    if (error) return jsonFail(500, "DB_ERROR", error.message);
    return jsonOk({ types: all ?? [] });
  }

  const rawTypes = Array.isArray(v.payload.types) ? v.payload.types : null;
  if (!rawTypes || rawTypes.length > 20) return jsonFail(400, "BAD_REQUEST", "types fehlt oder zu lang");

  const types: TicketTypeInput[] = [];
  for (let i = 0; i < rawTypes.length; i++) {
    const c = clean(rawTypes[i], i);
    if (typeof c === "string") return jsonFail(400, "VALIDATION", c);
    types.push(c);
  }
  if (types.some((t) => t.price_cents > 0)) {
    const row = await connectedAccountRow(admin, event.account_id);
    if (!row?.charges_enabled) return jsonFail(409, "CONNECT_REQUIRED", "Bezahlte Tickets brauchen ein aktives Stripe-Konto (Zahlungen einrichten).");
  }

  for (const t of types) {
    const values = { event_id: eventId, account_id: event.account_id, name: t.name, description: t.description, price_cents: t.price_cents,
      capacity: t.capacity, per_order_max: t.per_order_max, sales_end: t.sales_end, sort_order: t.sort_order, is_active: t.is_active, updated_at: new Date().toISOString() };
    const q = t.id
      ? admin.from("ticket_types").update(values).eq("id", t.id).eq("event_id", eventId)
      : admin.from("ticket_types").insert(values);
    const { error } = await q;
    if (error) return jsonFail(500, "DB_ERROR", error.message);
  }
  const { data: all } = await admin.from("ticket_types").select("*").eq("event_id", eventId).order("sort_order");
  return jsonOk({ types: all ?? [] });
}
