"use client";

import { useState } from "react";

interface Props {
  enabled: boolean;
  iban: string | null;
  bic: string | null;
  recipient: string | null;
  presetsCents: number[];
  minCents: number;
  maxCents: number;
  treasurySafe: string;
}

const fmtEur = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

/** Group an IBAN into 4-char blocks for readability. */
const fmtIban = (iban: string) => iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

export function DonateWidget({
  enabled,
  iban,
  bic,
  recipient,
  presetsCents,
  minCents,
  maxCents,
  treasurySafe,
}: Props) {
  const [selectedCents, setSelectedCents] = useState<number>(presetsCents[1] ?? 1000);
  const [customAmount, setCustomAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorMessage, setDonorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showCrypto, setShowCrypto] = useState(false);

  const customCents = customAmount
    ? Math.round(parseFloat(customAmount.replace(",", ".")) * 100)
    : null;
  const effectiveCents =
    customCents && Number.isFinite(customCents) ? customCents : selectedCents;
  const amountValid =
    Number.isInteger(effectiveCents) &&
    effectiveCents >= minCents &&
    effectiveCents <= maxCents;

  async function startCheckout() {
    if (!amountValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/donate/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_cents: effectiveCents,
          donor_name: donorName || undefined,
          donor_message: donorMessage || undefined,
          locale: "de",
        }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        throw new Error(body.error ?? "checkout_failed");
      }
      window.location.href = body.url;
    } catch (err) {
      setError(
        err instanceof Error && err.message === "donations_disabled"
          ? "Beiträge sind aktuell deaktiviert."
          : "Die Zahlung konnte nicht gestartet werden. Bitte versuche es später erneut.",
      );
      setSubmitting(false);
    }
  }

  async function loadReference() {
    if (referenceCode || referenceLoading) return;
    setReferenceLoading(true);
    try {
      const res = await fetch("/api/donate/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: donorName || undefined }),
      });
      const body = (await res.json()) as { code?: string };
      if (body.code) setReferenceCode(body.code);
    } catch {
      // Reference is optional — transfers without it still arrive (as "Anonym").
    } finally {
      setReferenceLoading(false);
    }
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard unavailable — user can select manually.
    }
  }

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Bald verfügbar
        </h2>
        <p className="text-sm text-muted-foreground">
          Die Möglichkeit, die Gemeinschaftskasse direkt zu unterstützen, wird
          gerade eingerichtet. Schau bald wieder vorbei!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Card checkout */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Mit Karte beitragen
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Kreditkarte, Apple Pay oder Google Pay — aus der ganzen Welt.
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
          {presetsCents.map((cents) => {
            const active = !customAmount && selectedCents === cents;
            return (
              <button
                key={cents}
                type="button"
                onClick={() => {
                  setSelectedCents(cents);
                  setCustomAmount("");
                }}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-[#00498B] bg-[#00498B] text-white"
                    : "border-border bg-background text-foreground hover:border-[#00498B]"
                }`}
              >
                {fmtEur(cents)} €
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Eigener Betrag"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#00498B] focus:outline-none"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              €
            </span>
          </div>
        </div>

        <input
          type="text"
          placeholder="Dein Name (öffentlich sichtbar, optional)"
          value={donorName}
          maxLength={60}
          onChange={(e) => setDonorName(e.target.value)}
          className="mb-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#00498B] focus:outline-none"
        />
        <input
          type="text"
          placeholder="Nachricht an die Stadt (optional)"
          value={donorMessage}
          maxLength={280}
          onChange={(e) => setDonorMessage(e.target.value)}
          className="mb-4 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#00498B] focus:outline-none"
        />

        {!amountValid && (customAmount || selectedCents) ? (
          <p className="text-xs text-red-600 mb-2">
            Betrag zwischen {fmtEur(minCents)} € und {fmtEur(maxCents)} € wählen.
          </p>
        ) : null}
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

        <button
          type="button"
          disabled={!amountValid || submitting}
          onClick={startCheckout}
          className="w-full rounded-full bg-[#00498B] px-5 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {submitting
            ? "Einen Moment…"
            : `${fmtEur(effectiveCents)} € beitragen`}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Sichere Zahlung über Stripe
        </p>
      </section>

      {/* SEPA transfer */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Per Überweisung
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Ohne Gebühren, direkt von deinem Bankkonto. Mit Echtzeitüberweisung
          ist dein Beitrag in Sekunden in der Kasse — für alle sichtbar.
        </p>

        <dl className="space-y-2 text-sm">
          {recipient && (
            <Row label="Empfänger" value={recipient} onCopy={() => copy(recipient, "recipient")} copied={copied === "recipient"} />
          )}
          {iban && (
            <Row label="IBAN" value={fmtIban(iban)} mono onCopy={() => copy(iban.replace(/\s+/g, ""), "iban")} copied={copied === "iban"} />
          )}
          {bic && (
            <Row label="BIC" value={bic} mono onCopy={() => copy(bic, "bic")} copied={copied === "bic"} />
          )}
          <Row
            label="Verwendungszweck"
            value={referenceCode ?? (referenceLoading ? "…" : "Code anzeigen")}
            mono={!!referenceCode}
            onCopy={referenceCode ? () => copy(referenceCode, "ref") : loadReference}
            copied={copied === "ref"}
            actionLabel={referenceCode ? undefined : "Erstellen"}
          />
        </dl>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Der persönliche Code im Verwendungszweck ordnet deinen Beitrag deinem
          Namen zu. Ohne Code erscheint er als „Anonym“.
        </p>
      </section>

      {/* On-chain */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <button
          type="button"
          onClick={() => setShowCrypto((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Onchain beitragen
            </h2>
            <p className="text-sm text-muted-foreground">
              Für Krypto-Kenner: direkt an die Kasse auf Gnosis Chain.
            </p>
          </div>
          <span className="text-muted-foreground">{showCrypto ? "−" : "+"}</span>
        </button>
        {showCrypto && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">
              Sende EURe oder xDAI auf <strong>Gnosis Chain (Chain-ID 100)</strong> an
              die Gemeinschaftskasse (Safe):
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground">
                {treasurySafe}
              </code>
              <button
                type="button"
                onClick={() => copy(treasurySafe, "safe")}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-[#00498B]"
              >
                {copied === "safe" ? "Kopiert ✓" : "Kopieren"}
              </button>
            </div>
            <a
              href={`https://gnosisscan.io/address/${treasurySafe}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs font-medium text-[#00498B] hover:underline"
            >
              Auf GnosisScan ansehen →
            </a>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  onCopy,
  copied,
  actionLabel,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy: () => void;
  copied: boolean;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={`min-w-0 flex-1 truncate text-right font-medium text-foreground ${mono ? "font-mono text-[13px]" : ""}`}
      >
        {value}
      </dd>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:border-[#00498B]"
      >
        {copied ? "✓" : (actionLabel ?? "Kopieren")}
      </button>
    </div>
  );
}
