import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { roleInAccount } from "@/lib/tickets/authz";
import { parseTicketQrPayload, ticketQrPayload } from "@/lib/tickets/codes";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["checkin"] });
  if (!v.ok) return failResponse(v);
  const parsed = parseTicketQrPayload(String(v.payload.payload ?? ""));
  if (!parsed) return jsonOk({ result: "invalid" });
  const admin = createAdminClient();
  const { data: t } = await admin.from("tickets").select("id, code, status, checked_in_at, event_id, ticket_type_id").eq("code", parsed.code).maybeSingle();
  if (!t) return jsonOk({ result: "invalid" });
  const { data: ev } = await admin.from("events").select("id, title, account_id").eq("id", t.event_id).maybeSingle();
  if (!ev?.account_id || !(await roleInAccount(admin, ev.account_id, v.wallet))) return jsonFail(403, "FORBIDDEN", "Du gehörst nicht zum Veranstalter dieses Tickets.");
  const { data: tt } = await admin.from("ticket_types").select("name").eq("id", t.ticket_type_id).maybeSingle();
  const view = (row: typeof t) => ({ id: row.id, code: row.code, qr: ticketQrPayload(row.code), status: row.status, checked_in_at: row.checked_in_at, ticket_type_name: tt?.name ?? "Ticket" });
  const counts = async () => {
    const [{ count: issued }, { count: checked }] = await Promise.all([
      admin.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", t.event_id).in("status", ["issued", "checked_in"]),
      admin.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", t.event_id).eq("status", "checked_in"),
    ]);
    return { issued_count: issued ?? 0, checked_in_count: checked ?? 0 };
  };
  if (t.status === "refunded" || t.status === "void") return jsonOk({ result: "refunded", ticket: view(t), event_title: ev.title, ...(await counts()) });
  if (t.status === "checked_in") return jsonOk({ result: "already_checked_in", ticket: view(t), event_title: ev.title, ...(await counts()) });
  const { data: updated } = await admin.from("tickets")
    .update({ status: "checked_in", checked_in_at: new Date().toISOString(), checked_in_by_wallet: v.wallet })
    .eq("id", t.id).eq("status", "issued").select("id, code, status, checked_in_at, event_id, ticket_type_id").maybeSingle();
  if (!updated) return jsonOk({ result: "already_checked_in", ticket: view(t), event_title: ev.title, ...(await counts()) });
  return jsonOk({ result: "ok", ticket: view(updated), event_title: ev.title, ...(await counts()) });
}
