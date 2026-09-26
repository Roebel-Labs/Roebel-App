// Gemeinschaftskasse (civic treasury) € figure for citizens. Live value =
// lib/muenzen/gnosis.ts treasuryEuro() (xDAI live-converted + EURe, Münzen
// excluded — the same figure the app hero and proposal snapshots use). While
// funds move between addresses the live read can return ~0; then the dated
// snapshot (mirrors apps/expo/constants/treasury-snapshot.ts) takes over so
// nobody reads "0 €" as "the money is gone". Cached 10 min in memory.

/** Mirrors apps/expo/constants/treasury-snapshot.ts — keep in sync. */
export const TREASURY_SNAPSHOT_ENABLED = true;
export const TREASURY_SNAPSHOT = { euroTotal: 196.09, asOfIso: "2026-09-22", asOfLabel: "22.09.2026" } as const;
export const TREASURY_LIVE_MIN_EURO = 1;

export function resolveTreasuryEuro(liveEuro: number | null | undefined): { euro: number; fromSnapshot: boolean } {
  const live = typeof liveEuro === "number" && Number.isFinite(liveEuro) ? liveEuro : null;
  if (!TREASURY_SNAPSHOT_ENABLED) return { euro: live ?? 0, fromSnapshot: false };
  if (live === null || live < TREASURY_LIVE_MIN_EURO) return { euro: TREASURY_SNAPSHOT.euroTotal, fromSnapshot: true };
  return { euro: live, fromSnapshot: false };
}

export function formatEuro(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

let cache: { at: number; live: number | null } | null = null;
const TTL_MS = 10 * 60 * 1000;

async function defaultReader(): Promise<number> {
  // Lazy: gnosis.ts is server-only (viem + RPC) and must not load in tests.
  const { treasuryEuro } = await import("../muenzen/gnosis");
  return treasuryEuro();
}

export async function getTreasury(
  _tenantId: string,
  opts: { origin?: string; read?: () => Promise<number>; now?: number } = {},
) {
  const now = opts.now ?? Date.now();
  let live: number | null;
  if (cache && now - cache.at < TTL_MS && !opts.read) {
    live = cache.live;
  } else {
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      live = await Promise.race([
        (opts.read ?? defaultReader)(),
        new Promise<number>((_, rej) => {
          timer = setTimeout(() => rej(new Error("timeout")), 8000);
        }),
      ]).finally(() => clearTimeout(timer));
    } catch {
      live = null;
    }
    if (!opts.read) cache = { at: now, live };
  }
  const { euro, fromSnapshot } = resolveTreasuryEuro(live);
  return {
    name: "Gemeinschaftskasse",
    guthaben_eur: Math.round(euro * 100) / 100,
    guthaben_text: formatEuro(euro),
    stand: fromSnapshot ? `Stand ${TREASURY_SNAPSHOT.asOfLabel} (Momentaufnahme)` : "live",
    erklaerung:
      "Gemeinsames Konto der Bürgerinnen und Bürger (Safe auf Gnosis Chain, verwaltet von den Bescheinigern). " +
      "Enthält Euro-Werte (xDAI und EURe); Röbel-Münzen zählen nicht dazu. " +
      "Ausgaben laufen über Bürgervorschläge mit Abstimmung.",
    unterstuetzen_url: `${(opts.origin ?? "https://www.roebel.app").replace(/\/+$/, "")}/spenden`,
  };
}
