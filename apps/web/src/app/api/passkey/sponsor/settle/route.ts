import { handleSponsorSettle } from "@/lib/passkey/sponsor-settle";
import { sponsorBudget, userOpEvents } from "@/lib/passkey/sponsor-runtime";

/**
 * POST /api/passkey/sponsor/settle { chainId: 100, userOpHash }: settles the sponsor budget
 * reservation of a landed device-session op to the EntryPoint's actualGasCost, read from chain
 * (never a client-sent amount), and lazily sweeps expired reservations. Contract and design:
 * lib/passkey/sponsor-settle.ts (security review M-2).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleSponsorSettle(request, { budget: sponsorBudget(), events: userOpEvents() });
}
