// GET /api/muenzen/flow?range=7d|30d|90d|all — the money flow for the Geldfluss
// tab: time-series, a closed-loop flow diagram with RCRC totals, and a recent
// name-resolved transfer feed. Built from on-chain Circles transfers.
import { NextResponse } from "next/server";
import { requireAdmin, isFresh, getParam, jsonError } from "@/lib/muenzen/api";
import { cached, TTL } from "@/lib/muenzen/cache";
import { loadTransfers, rangeWindow } from "@/lib/muenzen/economy";
import { dailyBuckets } from "@/lib/muenzen/series";
import { resolveIdentities } from "@/lib/muenzen/identity";
import { ADDR, ZERO_ADDRESS, attoToNumber } from "@/lib/muenzen/constants";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const fresh = isFresh(req);
  const range = getParam(req, "range") || "30d";

  try {
    const data = await cached(
      `flow:${range}`,
      TTL.chain,
      async () => {
        const now = Date.now();
        const since = rangeWindow(range, now).sinceMs;
        const all = await loadTransfers(fresh);
        const ranged = all.filter((t) => t.timestamp >= since);

        const funder = ADDR.funder.toLowerCase();
        const safe = ADDR.safe.toLowerCase();

        // Diagram edge totals (special-case Safe→Funder top-ups so they don't
        // read as a "spend").
        const edge = { mint: 0, earn: 0, spend: 0, topup: 0, peer: 0 };
        for (const t of ranged) {
          const v = attoToNumber(t.value);
          if (t.from === ZERO_ADDRESS) edge.mint += v;
          else if (t.from === safe && t.to === funder) edge.topup += v;
          else if (t.from === funder) edge.earn += v;
          else if (t.to === funder) edge.spend += v;
          else edge.peer += v;
        }

        const series = dailyBuckets(all, since);

        // Recent feed (newest 25) with name resolution.
        const recentRaw = ranged.slice(0, 25);
        const idMap = await resolveIdentities(recentRaw.flatMap((t) => [t.from, t.to]));
        const kindOf = (t: (typeof recentRaw)[number]) => {
          if (t.from === ZERO_ADDRESS) return "mint";
          if (t.from === safe && t.to === funder) return "topup";
          if (t.from === funder) return "earn";
          if (t.to === funder) return "spend";
          return "peer";
        };
        const recent = recentRaw.map((t, i) => ({
          id: `${t.txHash}-${i}`,
          kind: kindOf(t),
          from: t.from,
          to: t.to,
          fromName: idMap.get(t.from)?.name ?? null,
          toName: idMap.get(t.to)?.name ?? null,
          value: attoToNumber(t.value),
          timestamp: t.timestamp,
          txHash: t.txHash,
        }));

        return {
          range,
          totals: { mint: edge.mint, earn: edge.earn, spend: edge.spend, topup: edge.topup, peer: edge.peer },
          series,
          diagram: edge,
          recent,
          generatedAt: now,
        };
      },
      fresh,
    );

    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e);
  }
}
