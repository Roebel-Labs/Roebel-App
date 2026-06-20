import { useEffect, useState } from "react";
import { useGnosisWallet } from "@/context/GnosisWalletContext";
import { roebeltalerGroupAddress } from "@/constants/gnosis";

const CIRCLES_RPC = "https://rpc.aboutcircles.com/";

export interface TalerTx {
  id: string;
  direction: "in" | "out";
  value: number; // Röbel Münzen
  timestamp: number; // ms
}

/** One direction of the Circles transfer log for an address (group token kept client-side). */
async function queryTransfers(column: "from" | "to", address: string) {
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
          // tokenAddress is not filterable server-side (see useRoebelTalerWeekly),
          // so filter by direction only and keep the group token client-side.
          Filter: [{ Type: "FilterPredicate", FilterType: "Equals", Column: column, Value: address.toLowerCase() }],
          Order: [{ Column: "blockNumber", SortOrder: "Desc" }],
          Limit: 200,
        },
      ],
    }),
  });
  const json = await res.json();
  return { cols: (json?.result?.columns ?? []) as string[], rows: (json?.result?.rows ?? []) as any[][] };
}

/**
 * Real Röbel Münzen transaction history for the connected citizen — received + sent
 * group-token transfers from the Circles RPC, merged and sorted newest-first.
 */
export function useRoebelTalerHistory() {
  const { gnosisAddress } = useGnosisWallet();
  const [items, setItems] = useState<TalerTx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gnosisAddress) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const group = roebeltalerGroupAddress.toLowerCase();
        const [recv, sent] = await Promise.all([
          queryTransfers("to", gnosisAddress),
          queryTransfers("from", gnosisAddress),
        ]);

        const parse = (r: { cols: string[]; rows: any[][] }, dir: "in" | "out"): TalerTx[] => {
          const ti = r.cols.indexOf("timestamp");
          const vi = r.cols.indexOf("value");
          const tki = r.cols.indexOf("tokenAddress");
          const hi = r.cols.indexOf("transactionHash");
          const li = r.cols.indexOf("logIndex");
          const bi = r.cols.indexOf("blockNumber");
          const out: TalerTx[] = [];
          for (const row of r.rows) {
            if (tki >= 0 && String(row[tki] ?? "").toLowerCase() !== group) continue;
            let v = 0;
            try {
              v = Number(BigInt(row[vi] ?? "0")) / 1e18;
            } catch {
              v = 0;
            }
            if (v <= 0) continue;
            const ts = Number(row[ti] ?? 0) * 1000;
            const id = `${dir}-${row[hi] ?? row[bi] ?? ""}-${row[li] ?? ""}-${ts}`;
            out.push({ id, direction: dir, value: v, timestamp: ts });
          }
          return out;
        };

        const merged = [...parse(recv, "in"), ...parse(sent, "out")].sort(
          (a, b) => b.timestamp - a.timestamp
        );
        if (!cancelled) {
          setItems(merged);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gnosisAddress]);

  return { items, loading };
}
