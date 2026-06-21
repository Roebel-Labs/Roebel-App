// POST /api/muenzen/invite — admin-triggered Circles onboarding. Delegates to
// the deployed `circles-invite` edge function (the operator key lives only in
// Supabase secrets, never in the web app). Body: { address }.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = await req.json();
    const address = String(body.address ?? "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ error: "ungültige Adresse" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.functions.invoke("circles-invite", {
      body: { gnosisAddress: address },
    });
    if (error) throw error;
    if (data?.error) return NextResponse.json({ error: data.error }, { status: 400 });

    return NextResponse.json({ ok: true, result: data });
  } catch (e) {
    return jsonError(e);
  }
}
