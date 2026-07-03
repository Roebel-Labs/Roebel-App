// GET /api/muenzen/overview — headline KPIs, time-series and alerts for the
// Übersicht tab. Aggregates on-chain Circles data (primary truth) with the
// Supabase reward rails (graceful when empty).
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, isFresh, jsonError } from "@/lib/muenzen/api";
import { cached, TTL } from "@/lib/muenzen/cache";
import {
  loadHolders,
  loadCitizens,
  loadCollateral,
  loadTransfers,
  totalsSince,
  rangeWindow,
} from "@/lib/muenzen/economy";
import { dailyBuckets, withCumulativeSupply } from "@/lib/muenzen/series";
import { rcrcTotalSupply, rcrcBalance, nativeBalance, eureBalance } from "@/lib/muenzen/gnosis";
import {
  ADDR,
  getXdaiEurRate,
  MUENZE_EUR,
  FUNDER_LOW_RCRC,
  COLLATERAL_DRIFT_TOLERANCE,
  attoToNumber,
} from "@/lib/muenzen/constants";

export const dynamic = "force-dynamic";

interface Alert {
  level: "warning" | "info";
  key: string;
  message: string;
}

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const fresh = isFresh(req);

  try {
    const data = await cached(
      "overview",
      TTL.chain,
      async () => {
        const now = Date.now();
        const [holderSet, citizens, collateral, transfers, totalSupplyOnchain] = await Promise.all([
          loadHolders(fresh),
          loadCitizens(fresh),
          loadCollateral(fresh),
          loadTransfers(fresh),
          rcrcTotalSupply(),
        ]);

        const [funderRcrc, safeRcrc, safeXdai, safeEure] = await Promise.all([
          rcrcBalance(ADDR.funder).catch(() => 0n),
          rcrcBalance(ADDR.safe).catch(() => 0n),
          nativeBalance(ADDR.safe),
          eureBalance(ADDR.safe),
        ]);

        const totals = {
          "24h": totalsSince(transfers, rangeWindow("24h", now).sinceMs),
          "7d": totalsSince(transfers, rangeWindow("7d", now).sinceMs),
          "30d": totalsSince(transfers, rangeWindow("30d", now).sinceMs),
          all: totalsSince(transfers, 0),
        };

        const buckets = dailyBuckets(transfers, rangeWindow("90d", now).sinceMs);
        const series = withCumulativeSupply(buckets);

        // Supabase rails (empty today, but wired): errored claims monitor.
        let erroredClaims = 0;
        try {
          const supabase = createAdminClient();
          const { count } = await supabase
            .from("reward_claims")
            .select("id", { count: "exact", head: true })
            .eq("status", "failed");
          erroredClaims = count ?? 0;
        } catch {
          /* ignore */
        }

        const safeEuro =
          attoToNumber(safeXdai) * (await getXdaiEurRate()) +
          attoToNumber(safeEure) +
          attoToNumber(safeRcrc) * MUENZE_EUR;

        const alerts: Alert[] = [];
        const funder = attoToNumber(funderRcrc);
        if (funder < FUNDER_LOW_RCRC) {
          alerts.push({
            level: "warning",
            key: "funder_low",
            message: `Funder niedrig: ${funder.toFixed(2)} RCRC (Schwelle ${FUNDER_LOW_RCRC}). Aus der Stadtkasse nachfüllen.`,
          });
        }
        if (collateral.supply > 0) {
          if (collateral.ratio < 1 - COLLATERAL_DRIFT_TOLERANCE) {
            alerts.push({
              level: "warning",
              key: "collateral_under",
              message: `Unterdeckung: ${(collateral.ratio * 100).toFixed(1)}% Sicherheiten gegenüber dem Umlauf.`,
            });
          } else if (collateral.ratio > 1 + COLLATERAL_DRIFT_TOLERANCE) {
            alerts.push({
              level: "info",
              key: "collateral_over",
              message: `Überdeckung: ${(collateral.ratio * 100).toFixed(1)}% Sicherheiten im Tresor.`,
            });
          }
        }
        if (erroredClaims > 0) {
          alerts.push({
            level: "warning",
            key: "errored_claims",
            message: `${erroredClaims} fehlgeschlagene Belohnungs-Auszahlung(en) prüfen.`,
          });
        }

        return {
          supply: holderSet.supply,
          onchainTotalSupply: totalSupplyOnchain != null ? attoToNumber(totalSupplyOnchain) : null,
          holders: holderSet.holders.length,
          citizens: { trusted: citizens.trusted.length, joined: citizens.joined },
          collateral,
          funder: { rcrc: funder },
          safe: {
            rcrc: attoToNumber(safeRcrc),
            xdai: attoToNumber(safeXdai),
            eure: attoToNumber(safeEure),
            euro: safeEuro,
          },
          totals,
          series,
          topHolders: holderSet.holders.slice(0, 5),
          alerts,
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
