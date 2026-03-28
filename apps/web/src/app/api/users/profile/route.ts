import { NextRequest, NextResponse } from "next/server";
import {
  getUserByWalletAddress,
  createOrUpdateUser,
  updateUserProfile,
} from "@/lib/supabase-users";
import type { CreateUserInput, UpdateUserProfileInput } from "@/lib/user-types";

/**
 * GET /api/users/profile?wallet_address=0x...
 * Fetch user profile by wallet address
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get("wallet_address");

  if (!walletAddress) {
    return NextResponse.json(
      { error: "wallet_address parameter is required" },
      { status: 400 }
    );
  }

  console.log("🔍 [API] Fetching user profile:", walletAddress);

  const result = await getUserByWalletAddress(walletAddress);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ success: true, user: result.data });
}

/**
 * POST /api/users/profile
 * Create new user profile
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateUserInput = await request.json();

    console.log("➕ [API] Creating user profile:", body.wallet_address);

    if (!body.wallet_address) {
      return NextResponse.json(
        { error: "wallet_address is required" },
        { status: 400 }
      );
    }

    const result = await createOrUpdateUser(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: result.data });
  } catch (error) {
    console.error("❌ [API] Error creating user:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create user",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/profile
 * Update user profile (username, picture, bio)
 */
export async function PATCH(request: NextRequest) {
  try {
    const body: UpdateUserProfileInput = await request.json();

    console.log("✏️ [API] Updating user profile:", body.wallet_address);

    if (!body.wallet_address) {
      return NextResponse.json(
        { error: "wallet_address is required" },
        { status: 400 }
      );
    }

    const result = await updateUserProfile(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: result.data });
  } catch (error) {
    console.error("❌ [API] Error updating user:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update user",
      },
      { status: 500 }
    );
  }
}
