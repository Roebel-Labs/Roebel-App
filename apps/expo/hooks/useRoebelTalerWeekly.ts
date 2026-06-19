import { useEffect, useMemo, useState } from "react";
import { useGnosisWallet } from "@/context/GnosisWalletContext";
import { roebeltalerGroupAddress } from "@/constants/gnosis";

const CIRCLES_RPC = "https://rpc.aboutcircles.com/";
const WEEK = 7 * 86_400_000;

/**
 * Weekly earned Röbel Münzen for the chart — REAL on-chain data. Queries the Circles RPC
 * for incoming group-token transfers (mints + received) to the connected citizen, buckets
 * them into the last 6 weeks, and sums. Falls back to a flat 0 baseline if no wallet / no
 * data (the honest empty state for a brand-new account).
 */
export function useRoebelTalerWeekly() {
  const { gnosisAddress } = useGnosisWallet();
  const [points, setPoints] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [changePct, setChangePct] = useState(0);

  const labels = useMemo(() => {
    const ls: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getTime() - i * WEEK);
      ls.push(i === 0 ? "Heute" : d.toLocaleDateString("de-DE", { day: "numeric", month: "short" }));
    }
    return ls;
  }, []);

  useEffect(() => {
    if (!gnosisAddress) {
      setPoints([0, 0, 0, 0, 0, 0]);
      setChangePct(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(CIRCLES_RPC, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "circles_query",
            params: [
              {
                Namespace: "V_CrcV2",
                Table: "Transfers",
                Columns: [],
                // The Circles RPC does NOT allow filtering V_CrcV2_Transfers by
                // `tokenAddress` (errors -32602: column not filterable), which made
                // the whole query throw → flat 0 chart. So we filter by `to` only and
                // keep just the Röbel Münzen group token client-side (below).
                Filter: [
                  { Type: "FilterPredicate", FilterType: "Equals", Column: "to", Value: gnosisAddress.toLowerCase() },
                ],
                Order: [{ Column: "blockNumber", SortOrder: "Desc" }],
                Limit: 500,
              },
            ],
          }),
        });
        const json = await res.json();
        const cols: string[] = json?.result?.columns ?? [];
        const rows: any[][] = json?.result?.rows ?? [];
        const ti = cols.indexOf("timestamp");
        const vi = cols.indexOf("value");
        const tki = cols.indexOf("tokenAddress");
        const group = roebeltalerGroupAddress.toLowerCase();
        const now = Date.now();
        const buckets = [0, 0, 0, 0, 0, 0];
        for (const r of rows) {
          // Keep ONLY Röbel Münzen group-token receipts; skip the intermediate
          // personal-CRC mints (same `to`, different token).
          if (tki >= 0 && String(r[tki] ?? "").toLowerCase() !== group) continue;
          const ts = Number(r[ti] ?? 0) * 1000;
          let v = 0;
          try {
            v = Number(BigInt(r[vi] ?? "0")) / 1e18;
          } catch {
            v = 0;
          }
          const weeksAgo = Math.floor((now - ts) / WEEK);
          if (weeksAgo >= 0 && weeksAgo <= 5) buckets[5 - weeksAgo] += v;
        }
        if (cancelled) return;
        setPoints(buckets);
        const thisW = buckets[5];
        const lastW = buckets[4];
        setChangePct(lastW > 0 ? Math.round(((thisW - lastW) / lastW) * 100) : thisW > 0 ? 100 : 0);
      } catch {
        if (!cancelled) {
          setPoints([0, 0, 0, 0, 0, 0]);
          setChangePct(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gnosisAddress]);

  return { labels, points, changePct };
}
