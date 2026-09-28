import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What the organiser sees per order. Deliberately no buyer_wallet and no buyer_email: an org
 * needs the money, the ticket count and the check-in count to run its door — not the identity
 * of the people who bought. The buyer-facing OrderView (lib/tickets/views.ts) stays separate.
 */
export type OrgOrderView = {
  id: string; status: string; quantity: number; amount_cents: number; currency: string; rail: string;
  created_at: string; paid_at: string | null; refunded_at: string | null;
  ticket_type_name: string; tickets_total: number; tickets_checked_in: number;
};

const MAX_ORDERS = 200;

/** Newest-first order list for one event, as the organiser sees it (no buyer identity). */
export async function orgOrderViews(admin: SupabaseClient, eventId: string): Promise<OrgOrderView[]> {
  const { data: orders, error } = await admin.from("ticket_orders")
    .select("id, status, quantity, amount_cents, currency, rail, created_at, paid_at, refunded_at, ticket_type_id")
    .eq("event_id", eventId).order("created_at", { ascending: false }).limit(MAX_ORDERS);
  if (error) throw new Error(error.message);
  if (!orders || orders.length === 0) return [];

  const [{ data: types }, { data: tickets }] = await Promise.all([
    admin.from("ticket_types").select("id, name").in("id", [...new Set(orders.map((o) => o.ticket_type_id))]),
    admin.from("tickets").select("order_id, status").in("order_id", orders.map((o) => o.id)),
  ]);
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name as string]));

  const views: OrgOrderView[] = orders.map((o) => {
    const own = (tickets ?? []).filter((t) => t.order_id === o.id);
    return {
      id: o.id, status: o.status, quantity: o.quantity, amount_cents: o.amount_cents, currency: o.currency,
      rail: o.rail, created_at: o.created_at, paid_at: o.paid_at, refunded_at: o.refunded_at,
      ticket_type_name: typeName.get(o.ticket_type_id) ?? "Ticket",
      tickets_total: own.length,
      tickets_checked_in: own.filter((t) => t.status === "checked_in").length,
    };
  });
  return views;
}
