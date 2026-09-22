import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignedRequest, failResponse, jsonOk } from "@/lib/signed-request/verify";
import { orderViews } from "@/lib/tickets/views";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const v = await verifySignedRequest(await request.json().catch(() => null), { actions: ["tickets_list"] });
  if (!v.ok) return failResponse(v);
  const admin = createAdminClient();
  return jsonOk({ orders: await orderViews(admin, { buyerWallet: v.wallet }) });
}
