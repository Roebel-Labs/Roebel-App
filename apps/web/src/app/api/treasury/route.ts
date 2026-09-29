import { NextResponse } from "next/server";
import { getTreasuryCached } from "@/lib/treasury/server";
import { TreasuryUnavailableError } from "@/lib/treasury/build";

// GET /api/treasury — the ONE source of the Gemeinschaftskasse € figure and
// its history for every app surface (hero, cards, proposal page, composer
// snapshot). Public, read-only, cached 5 minutes.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
	try {
		const data = await getTreasuryCached();
		return NextResponse.json(data, {
			headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
		});
	} catch (e) {
		// Fail closed: never answer with a guessed figure.
		const reason = e instanceof TreasuryUnavailableError ? e.message : "treasury unavailable";
		console.error("[api/treasury]", e);
		return NextResponse.json({ error: reason }, { status: 503, headers: { "Cache-Control": "no-store" } });
	}
}
