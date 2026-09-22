import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk, jsonFail } from "@/lib/signed-request/verify";
import { orderViews } from "@/lib/tickets/views";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["order_status"] });
  if (!v.ok) return failResponse(v);
  const orderId = String(v.payload.order_id ?? "");
  const [view] = await orderViews(createAdminClient(), { orderId, buyerWallet: v.wallet });
  if (!view) return jsonFail(404, "NOT_FOUND", "Bestellung nicht gefunden");
  return jsonOk(view);
}
