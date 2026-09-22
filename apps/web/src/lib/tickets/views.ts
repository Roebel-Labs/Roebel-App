import type { SupabaseClient } from "@supabase/supabase-js";
import { ticketQrPayload } from "./codes";

export type TicketView = { id: string; code: string; qr: string; status: string; checked_in_at: string | null; ticket_type_name: string };
export type OrderView = {
  id: string; status: string; quantity: number; amount_cents: number; currency: string; rail: string; expires_at: string | null; created_at: string;
  event: { id: string; title: string; date: string | null; time: string | null; location: string | null; image_url: string | null };
  ticket_type_name: string; tickets: TicketView[];
};

export async function orderViews(admin: SupabaseClient, filter: { buyerWallet?: string; orderId?: string }): Promise<OrderView[]> {
  let q = admin.from("ticket_orders")
    .select("id, status, quantity, amount_cents, currency, rail, expires_at, created_at, event_id, ticket_type_id, buyer_wallet")
    .order("created_at", { ascending: false }).limit(50);
  if (filter.orderId) q = q.eq("id", filter.orderId);
  if (filter.buyerWallet) q = q.eq("buyer_wallet", filter.buyerWallet.toLowerCase());
  const { data: orders } = await q;
  if (!orders || orders.length === 0) return [];
  const eventIds = [...new Set(orders.map((o) => o.event_id))];
  const typeIds = [...new Set(orders.map((o) => o.ticket_type_id))];
  const [{ data: events }, { data: types }, { data: tickets }] = await Promise.all([
    admin.from("events").select("id, title, date, time, location, image_url").in("id", eventIds),
    admin.from("ticket_types").select("id, name").in("id", typeIds),
    admin.from("tickets").select("id, order_id, code, status, checked_in_at, ticket_type_id").in("order_id", orders.map((o) => o.id)).order("created_at"),
  ]);
  const evById = new Map((events ?? []).map((e) => [e.id, e]));
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name as string]));
  return orders.map((o) => {
    const e = evById.get(o.event_id);
    return {
      id: o.id, status: o.status, quantity: o.quantity, amount_cents: o.amount_cents, currency: o.currency, rail: o.rail,
      expires_at: o.expires_at, created_at: o.created_at,
      event: { id: o.event_id, title: e?.title ?? "Veranstaltung", date: e?.date ?? null, time: e?.time ?? null, location: e?.location ?? null, image_url: e?.image_url ?? null },
      ticket_type_name: typeName.get(o.ticket_type_id) ?? "Ticket",
      tickets: (tickets ?? []).filter((t) => t.order_id === o.id).map((t) => ({
        id: t.id, code: t.code, qr: ticketQrPayload(t.code), status: t.status, checked_in_at: t.checked_in_at, ticket_type_name: typeName.get(t.ticket_type_id) ?? "Ticket",
      })),
    };
  });
}
