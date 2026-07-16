import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET /api/donate/recent — sanitized public list of recent settled
// contributions for the social-proof wall. NEVER exposes wallet addresses,
// bank memos, or Stripe/Monerium ids.
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("donations")
    .select("donor_name, donor_message, amount_cents, rail, settled_at, public_visible")
    .eq("status", "settled")
    .order("settled_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[donate.recent] query failed", error);
    return NextResponse.json({ donations: [] });
  }

  const donations = (data ?? []).map((row) => ({
    display_name: row.public_visible ? (row.donor_name ?? "Anonym") : "Anonym",
    message: row.public_visible ? (row.donor_message ?? null) : null,
    amount_cents: Number(row.amount_cents),
    rail: row.rail as string,
    settled_at: row.settled_at as string,
  }));

  return NextResponse.json({ donations });
}
