import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDonationCode, DONATION_CONFIG } from "@/lib/donations/config";

export const dynamic = "force-dynamic";

// POST /api/donate/reference
//
// Body: { wallet_address?: string, display_name?: string }
//
// Mints (or returns the existing) personal SEPA reference code the donor
// puts in their bank transfer's Verwendungszweck, so the Monerium webhook
// can attribute the incoming mint. App users get one persistent code per
// wallet; anonymous visitors get a fresh code per request.

const VALID_WALLET = /^0x[a-fA-F0-9]{40}$/;

export async function POST(request: NextRequest) {
  let body: { wallet_address?: unknown; display_name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const walletAddress =
    typeof body.wallet_address === "string" && VALID_WALLET.test(body.wallet_address)
      ? body.wallet_address.toLowerCase()
      : null;
  const displayName =
    typeof body.display_name === "string"
      ? body.display_name.trim().slice(0, DONATION_CONFIG.MAX_DONOR_NAME_LEN) || null
      : null;

  const supabase = createAdminClient();

  if (walletAddress) {
    const { data: existing, error: lookupErr } = await supabase
      .from("donation_references")
      .select("code")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    if (lookupErr) {
      console.error("[donate.reference] lookup failed", lookupErr);
      return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
    }
    if (existing) {
      // Refresh the display name so the latest one wins at attribution time.
      if (displayName) {
        await supabase
          .from("donation_references")
          .update({ display_name: displayName })
          .eq("code", existing.code);
      }
      return NextResponse.json({ code: existing.code });
    }
  }

  // Insert with retry on the (astronomically unlikely) code collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateDonationCode();
    const { error: insertErr } = await supabase.from("donation_references").insert({
      code,
      wallet_address: walletAddress,
      display_name: displayName,
    });
    if (!insertErr) {
      return NextResponse.json({ code });
    }
    if ((insertErr as { code?: string }).code === "23505") {
      // Code or wallet collided. Wallet collision = concurrent find-or-create
      // race → return the winner's code.
      if (walletAddress) {
        const { data: winner } = await supabase
          .from("donation_references")
          .select("code")
          .eq("wallet_address", walletAddress)
          .maybeSingle();
        if (winner) return NextResponse.json({ code: winner.code });
      }
      continue;
    }
    console.error("[donate.reference] insert failed", insertErr);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
  return NextResponse.json({ error: "code_generation_failed" }, { status: 500 });
}
