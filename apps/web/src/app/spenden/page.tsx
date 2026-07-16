// Public contribution page for the Gemeinschaftskasse.
//
// Wording: "Unterstützen"/"Beitrag", not "Spende" — no gemeinnützige
// entity exists yet, so no tax-deductibility may be implied and Stripe's
// ToS restricts charity framing (docs/MONERIUM_FIAT_TREASURY_RESEARCH.md §5/§6).
//
// Three rails, all landing in the same transparent Safe on Gnosis:
//   1. Card / Apple Pay / Google Pay via Stripe Checkout
//   2. SEPA transfer to the Monerium IBAN (auto-mints EURe into the Safe)
//   3. Direct on-chain transfer for crypto-native supporters

import { treasuryEuro } from "@/lib/muenzen/gnosis";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicDonationConfig } from "@/lib/donations/monerium";
import { TREASURY_SAFE } from "@/lib/donations/config";
import { DonateWidget } from "./DonateWidget";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Gemeinschaftskasse unterstützen — Röbel/Müritz",
  description:
    "Unterstütze die transparente Gemeinschaftskasse von Röbel/Müritz — per Karte, Überweisung oder direkt auf der Blockchain. Jeder Euro ist öffentlich sichtbar.",
};

const fmtEur = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface RecentContribution {
  display_name: string;
  message: string | null;
  amount_cents: number;
  settled_at: string;
}

async function fetchRecent(): Promise<RecentContribution[]> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("donations")
      .select("donor_name, donor_message, amount_cents, settled_at, public_visible")
      .eq("status", "settled")
      .order("settled_at", { ascending: false })
      .limit(8);
    return (data ?? []).map((row) => ({
      display_name: row.public_visible ? (row.donor_name ?? "Anonym") : "Anonym",
      message: row.public_visible ? (row.donor_message ?? null) : null,
      amount_cents: Number(row.amount_cents),
      settled_at: row.settled_at as string,
    }));
  } catch {
    return [];
  }
}

export default async function SpendenPage() {
  const [config, recent, balance] = await Promise.all([
    getPublicDonationConfig(),
    fetchRecent(),
    treasuryEuro().catch(() => null),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#00498B] mb-2">
            Gemeinschaftskasse Röbel/Müritz
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Unterstütze deine Stadt.
          </h1>
          <p className="text-base text-muted-foreground max-w-lg mx-auto">
            Jeder Beitrag fließt in die öffentliche Gemeinschaftskasse — über deren
            Verwendung alle Bürgerinnen und Bürger gemeinsam abstimmen. Jeder Euro
            ist jederzeit für alle sichtbar.
          </p>
          {balance != null && (
            <div className="mt-6 inline-flex flex-col items-center rounded-2xl border border-border bg-card px-8 py-4">
              <span className="text-xs text-muted-foreground">
                Aktueller Kassenstand
              </span>
              <span className="text-3xl font-bold text-foreground tabular-nums">
                {balance.toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                €
              </span>
            </div>
          )}
        </div>

        <DonateWidget
          enabled={config.enabled}
          iban={config.iban}
          bic={config.bic}
          recipient={config.recipient}
          presetsCents={[...config.presets_cents]}
          minCents={config.min_cents}
          maxCents={config.max_cents}
          treasurySafe={TREASURY_SAFE}
        />

        {/* Recent contributions */}
        {recent.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Letzte Beiträge
            </h2>
            <ul className="space-y-3">
              {recent.map((c, i) => (
                <li
                  key={`${c.settled_at}-${i}`}
                  className="flex items-start justify-between rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0 pr-4">
                    <p className="text-sm font-medium text-foreground truncate">
                      {c.display_name}
                    </p>
                    {c.message && (
                      <p className="text-sm text-muted-foreground mt-0.5 break-words">
                        „{c.message}“
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-[#00498B] whitespace-nowrap tabular-nums">
                    {fmtEur(c.amount_cents)} €
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Transparency + legal note */}
        <section className="mt-12 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground mb-2">
            Volle Transparenz
          </h2>
          <p className="text-sm text-muted-foreground">
            Die Gemeinschaftskasse ist ein offenes, digitales Stadtvermögen. Der
            Kontostand und jede Bewegung sind öffentlich einsehbar — in der
            Röbel App unter „Gemeinschaftskasse“. Über die Verwendung
            entscheiden verifizierte Bürgerinnen und Bürger per Abstimmung.
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            Hinweis: Beiträge sind freiwillige Zuwendungen an das
            Gemeinschaftsprojekt (Schenkung). Eine steuerlich absetzbare
            Spendenbescheinigung können wir derzeit noch nicht ausstellen.
          </p>
        </section>
      </main>
    </div>
  );
}
