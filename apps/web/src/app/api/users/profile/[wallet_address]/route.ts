import { NextRequest, NextResponse } from "next/server";
import { getPublicProfile } from "@/lib/supabase-users";

/**
 * GET /api/users/profile/[wallet_address]?viewer=0x...
 * Fetch a privacy-filtered public profile
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wallet_address: string }> }
) {
  const { wallet_address } = await params;

  if (!wallet_address) {
    return NextResponse.json(
      { error: "wallet_address is required" },
      { status: 400 }
    );
  }

  const viewerWallet = request.nextUrl.searchParams.get("viewer");

  const result = await getPublicProfile(wallet_address, viewerWallet);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ success: true, profile: result.data });
}
