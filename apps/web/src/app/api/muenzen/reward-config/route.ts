// POST /api/muenzen/reward-config — upsert a reward_config row (amount, caps,
// cooldown, enabled). Tunable without a deploy (tokenomics §3). Admin-gated.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { bustCache } from "@/lib/muenzen/cache";
import { numberToAtto } from "@/lib/muenzen/constants";

export const dynamic = "force-dynamic";

const KNOWN_ACTIONS = new Set([
  "proposal_vote",
  "checkpoint",
  "event_submit",
  "referral",
  "event_attend",
]);

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await req.json();
    const action = String(body.action ?? "").trim();
    if (!action || !KNOWN_ACTIONS.has(action)) {
      return NextResponse.json({ error: "unbekannte Aktion" }, { status: 400 });
    }

    const row: Record<string, unknown> = { action, updated_at: new Date().toISOString() };
    if (body.amountAtto != null) row.amount_atto = String(body.amountAtto);
    else if (body.amount != null) row.amount_atto = numberToAtto(Number(body.amount));
    if (body.enabled != null) row.enabled = Boolean(body.enabled);
    if (body.perReference != null) row.per_reference = Boolean(body.perReference);
    if (body.cooldownHours !== undefined) row.cooldown_hours = body.cooldownHours === null ? null : Number(body.cooldownHours);
    if (body.dailyCap !== undefined) row.daily_cap = body.dailyCap === null ? null : Number(body.dailyCap);
    if (body.description != null) row.description = String(body.description);

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("reward_config")
      .upsert(row, { onConflict: "action" })
      .select()
      .single();
    if (error) throw error;

    bustCache("rewards");
    bustCache("overview");
    return NextResponse.json({ ok: true, row: data });
  } catch (e) {
    return jsonError(e);
  }
}
