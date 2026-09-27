import { requireWallet } from "../../chat/_lib/http";
import {
  handleMenuImage, MENU_IMAGE_RATE_RULES, walletCanEditMenuItem, type OwnershipDb,
} from "@/lib/ai-proxy/menu-image";
import { sharedLimiters } from "@/lib/rate-limit/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// The edge function blocks up to ~50 s while kie.ai renders.
export const maxDuration = 90;

const limiters = sharedLimiters(MENU_IMAGE_RATE_RULES);

/**
 * POST /api/ai/menu-image — generate a menu item photo via the generate-menu-image edge function.
 * Auth: chat-session Bearer token + membership in the org that owns the menu item's restaurant.
 */
export async function POST(request: Request) {
  return handleMenuImage(request, {
    authenticate: requireWallet,
    limiters,
    canEditMenuItem: (wallet, menuItemId) =>
      walletCanEditMenuItem(createAdminClient() as unknown as OwnershipDb, wallet, menuItemId),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    seedToken: process.env.SUPABASE_SEED_TOKEN,
  });
}
