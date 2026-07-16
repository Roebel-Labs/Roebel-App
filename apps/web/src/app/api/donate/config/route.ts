import { NextResponse } from "next/server";
import { getPublicDonationConfig } from "@/lib/donations/monerium";
import { TREASURY_SAFE } from "@/lib/donations/config";

export const dynamic = "force-dynamic";

// GET /api/donate/config — public configuration for the contribution
// surfaces (expo Unterstützen screen + /spenden page). No secrets: the
// IBAN/recipient are meant to be published so people can transfer to them.
export async function GET() {
  const config = await getPublicDonationConfig();
  return NextResponse.json({
    ...config,
    treasury_safe: TREASURY_SAFE,
  });
}
