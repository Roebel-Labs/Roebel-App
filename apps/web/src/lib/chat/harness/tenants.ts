// Tenant configs (agent harness spec §3). Röbel is tenant #1; every tool is
// tenant-scoped so the next town only adds a config here.
// Facts are taken from the codebase/docs (preset bot instructions, CLAUDE.md,
// docs/CIRCLES_ROEBEL_MUENZEN_STATE.md, legal compliance notes) — never invented.
import type { TenantConfig } from "./types";

export const ROEBEL_TENANT: TenantConfig = {
  id: "roebel",
  name: "Röbel/Müritz",
  region: "Mecklenburgische Seenplatte",
  timezone: "Europe/Berlin",
  locale: "de",
  appOrigin: "https://www.roebel.app",
  facts: [
    "Röbel/Müritz ist eine Kleinstadt an der Müritz im Landkreis Mecklenburgische Seenplatte (Mecklenburg-Vorpommern).",
    "Zuständige Stellen: Stadt Röbel/Müritz, Amt Röbel-Müritz und der Landkreis Mecklenburgische Seenplatte.",
    "Die Röbel-App ist eine offene Bürger-App (Open Source) für Röbel: Veranstaltungen, Neuigkeiten, Vereine, Gastronomie, Marktplatz, Vorschläge und Abstimmungen.",
    "Mecky ist das Maskottchen und der KI-Assistent der Röbel-App.",
    "„Röbel Münzen“ sind die lokale Gemeinschaftswährung der App (auf Circles); nenn sie immer „Röbel Münzen“, nie mit Kürzel.",
    "Verifizierte Bürgerinnen und Bürger werden von anderen Röbelern bestätigt und können über Vorschläge abstimmen; Abstimmungen sind geheim.",
    "Abstimmungen in der App sind ein Meinungsbild der Bürgerschaft, keine rechtsverbindlichen Beschlüsse der Stadt.",
    "Die Gemeinschaftskasse ist der gemeinsame Topf der Röbeler Gemeinschaft; ihre Zahlen sind in der App öffentlich einsehbar.",
  ],
};

const TENANTS: Record<string, TenantConfig> = { roebel: ROEBEL_TENANT };

export function getTenant(id: string = "roebel"): TenantConfig {
  return TENANTS[id] ?? ROEBEL_TENANT;
}
