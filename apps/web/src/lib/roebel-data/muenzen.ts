// Röbel-Münzen (Circles v2 group token on Gnosis) balance of the signed-in
// wallet, read on-chain via lib/muenzen/gnosis.ts. Read-only.
import { walletFilter } from "./user";

export interface MuenzenReader {
  rcrcBalance(account: string): Promise<bigint>;
  isHuman(account: string): Promise<boolean>;
}

async function defaultReader(): Promise<MuenzenReader> {
  // Lazy: gnosis.ts is server-only (viem + RPC) and must not load in tests.
  const m = await import("../muenzen/gnosis");
  return { rcrcBalance: m.rcrcBalance, isHuman: m.isHuman };
}

/** 18-decimal atto → "12,34" (2 decimals, German). */
export function formatMuenzen(atto: bigint): string {
  const cents = (atto + 5n * 10n ** 15n) / 10n ** 16n; // round to 2 decimals
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${frac}`;
}

export async function getMyMuenzenBalance(wallet: string, reader?: MuenzenReader) {
  const w = walletFilter(wallet);
  try {
    const r = reader ?? (await defaultReader());
    const timeout = <T>(p: Promise<T>) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      return Promise.race([
        p,
        new Promise<T>((_, rej) => {
          timer = setTimeout(() => rej(new Error("timeout")), 8000);
        }),
      ]).finally(() => clearTimeout(timer));
    };
    const [bal, human] = await Promise.all([timeout(r.rcrcBalance(w)), timeout(r.isHuman(w)).catch(() => false)]);
    return {
      verfuegbar: true,
      guthaben: formatMuenzen(bal),
      einheit: "Röbel-Münzen",
      muenzen_konto_aktiv: human,
      hinweis: human
        ? "Röbel-Münzen verlieren langsam an Wert (Demurrage) und sind nicht in Euro umtauschbar."
        : bal > 0n
          ? "Guthaben vorhanden; das persönliche Münzen-Konto ist noch nicht vollständig eingerichtet."
          : "Noch kein Röbel-Münzen-Konto. Eine Einladung gibt es über die App (Profil → Röbel-Münzen).",
    };
  } catch {
    return {
      verfuegbar: false,
      hinweis: "Der Münzen-Kontostand ist gerade nicht verfügbar. Bitte in der App unter Profil nachsehen.",
    };
  }
}
