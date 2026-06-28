import { attoToNumber } from "@/lib/muenzen/constants";

export function eur(amount: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

/** "Wartet auf Freigaben (1/2)" or "Bereit zur Ausführung (2/2)". */
export function approvalLabel(n: number, m: number): string {
  return n >= m ? `Bereit zur Ausführung (${n}/${m})` : `Wartet auf Freigaben (${n}/${m})`;
}

export function muenzen(atto: bigint): string {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(attoToNumber(atto))} Röbel-Münzen`;
}
