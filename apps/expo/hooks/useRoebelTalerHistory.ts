import { useEffect, useState } from "react";
import { useGnosisWallet } from "@/context/GnosisWalletContext";
import { roebeltalerGroupAddress } from "@/constants/gnosis";
import { getCirclesProfile } from "@/lib/circles-profile";

const CIRCLES_RPC = "https://rpc.aboutcircles.com/";

export interface TalerTx {
  id: string;
  direction: "in" | "out";
  value: number; // Röbel Münzen
  timestamp: number; // ms
  counterparty: string; // the other address (sender for "in", recipient for "out")
  txHash: string;
  /** Circles profile, resolved best-effort after the list first renders. */
  name?: string | null;
  avatarUrl?: string | null;
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
 * Real Röbel Münzen transaction history — received + sent group-token transfers from the
 * Circles RPC, merged newest-first, then enriched with the counterparty's Circles name +
 * avatar (best-effort, after the list first renders).
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
        const self = gnosisAddress.toLowerCase();
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
          const fi = r.cols.indexOf("from");
          const toi = r.cols.indexOf("to");
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
            const from = String(row[fi] ?? "").toLowerCase();
            const to = String(row[toi] ?? "").toLowerCase();
            const counterparty = dir === "in" ? from : to;
            const txHash = String(row[hi] ?? "");
            const id = `${dir}-${txHash}-${row[li] ?? row[bi] ?? ""}-${ts}`;
            out.push({ id, direction: dir, value: v, timestamp: ts, counterparty, txHash });
          }
          return out;
        };

        const merged = [...parse(recv, "in"), ...parse(sent, "out")].sort(
          (a, b) => b.timestamp - a.timestamp
        );
        if (cancelled) return;
        setItems(merged);
        setLoading(false);

        // Enrich with Circles names + avatars — dedup, skip self/group, capped.
        const uniq = Array.from(
          new Set(merged.slice(0, 60).map((t) => t.counterparty))
        ).filter((a) => a && a !== group && a !== self);
        const profiles = new Map<string, { name: string | null; avatarUrl: string | null }>();
        await Promise.all(
          uniq.map(async (a) => {
            try {
              const p = await getCirclesProfile(a);
              profiles.set(a, { name: p.name, avatarUrl: p.imageUrl });
            } catch {
              /* leave unresolved */
            }
          })
        );
        if (cancelled || profiles.size === 0) return;
        setItems(
          merged.map((t) => {
            const p = profiles.get(t.counterparty);
            return p ? { ...t, name: p.name, avatarUrl: p.avatarUrl } : t;
          })
        );
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
