"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "@/lib/context/AccountContext";
import {
  isOrgAccount,
  subTypeFeatures,
  SUB_TYPE_LABELS,
} from "@/types/account";
import {
  createRoebelCardPartner,
  fetchPartnerByAccountId,
  RECHTSFORM_LABELS,
  type Rechtsform,
  type RoebelCardPartnerRow,
} from "@/lib/supabase-roebel-card-partners";
import { buildAgreementMetadata } from "@/lib/roebel-card-agreement-metadata";
import { formatIban, isValidIban, normalizeIban } from "@/lib/iban";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Handshake,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

const RECHTSFORM_OPTIONS: Rechtsform[] = [
  "einzelunternehmen",
  "gbr",
  "ug",
  "gmbh",
  "gmbh_co_kg",
  "ag",
  "ev",
  "ek",
  "ohg",
  "kg",
  "sonstige",
];

const VAT_ID_REGEX = /^DE\d{9}$/i;
const BIC_REGEX = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/i;

export default function PartnerDashboardPage() {
  const { activeAccount } = useAccount();
  const [partner, setPartner] = useState<RoebelCardPartnerRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!activeAccount || !isOrgAccount(activeAccount)) {
        setPartner(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const row = await fetchPartnerByAccountId(activeAccount.id);
      if (!cancelled) {
        setPartner(row);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeAccount?.id]);

  if (!activeAccount || !isOrgAccount(activeAccount)) {
    return null;
  }

  const features = subTypeFeatures(activeAccount.sub_type);

  if (!features.partner) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <BackLink />
        <Heading />
        <div className="bg-card border border-border rounded-[10px] p-6 flex gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">
              Nicht verfügbar für deinen Konto-Typ
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Die Röbel Card Partnerschaft steht nur Restaurants und Unternehmen
              offen. Dein Konto-Typ:{" "}
              {activeAccount.sub_type
                ? SUB_TYPE_LABELS[activeAccount.sub_type]
                : "—"}
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="h-48 bg-muted rounded-[10px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <BackLink />
      <Heading />

      {partner ? (
        <PartnerStatusView partner={partner} />
      ) : (
        <RegistrationForm
          accountId={activeAccount.id}
          accountName={activeAccount.name}
          accountAvatarUrl={activeAccount.avatar_url ?? activeAccount.cover_url}
          subTypeLabel={
            activeAccount.sub_type
              ? SUB_TYPE_LABELS[activeAccount.sub_type]
              : "Organisation"
          }
          onCreated={(row) => setPartner(row)}
        />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Zurück zum Dashboard
    </Link>
  );
}

function Heading() {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-medium flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        Röbel Card Partner
      </h1>
      <p className="text-sm text-muted-foreground">
        Akzeptiere die Röbel Card als Zahlungsmittel und erhalte den vollen
        Betrag aus dem Community-Fonds.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status view (after submission)
// ---------------------------------------------------------------------------

function PartnerStatusView({ partner }: { partner: RoebelCardPartnerRow }) {
  const submittedAt = partner.agreement_signed_at ?? partner.created_at;
  const submittedDate = new Date(submittedAt).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  if (partner.status === "approved") {
    return (
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-[10px] p-6 flex gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Aktiv</h2>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400">
                Genehmigt
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Dein Antrag wurde am{" "}
              {partner.approved_at
                ? new Date(partner.approved_at).toLocaleDateString("de-DE")
                : submittedDate}{" "}
              freigegeben. Du kannst jetzt Röbel Card Zahlungen annehmen.
            </p>
          </div>
        </div>

        <PartnerSummaryCard partner={partner} submittedDate={submittedDate} />

        <div className="bg-muted/50 border border-border rounded-[10px] p-4 text-sm text-muted-foreground">
          Zum Annehmen von Zahlungen (QR-Code-Scan) öffne die Röbel App auf
          deinem Smartphone — die mobile Partner-Oberfläche ist dort eingebaut.
        </div>
      </div>
    );
  }

  if (partner.status === "rejected" || partner.status === "suspended") {
    const isRejected = partner.status === "rejected";
    return (
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-[10px] p-6 flex gap-3">
          <ShieldAlert className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-base font-semibold">
              {isRejected ? "Antrag abgelehnt" : "Konto gesperrt"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isRejected
                ? "Leider konnten wir deinen Antrag nicht bewilligen."
                : "Dein Partner-Konto ist derzeit gesperrt."}{" "}
              Bei Fragen kontaktiere uns bitte unter{" "}
              <a
                href="mailto:partner@roebel.app"
                className="text-primary underline"
              >
                partner@roebel.app
              </a>
              .
            </p>
          </div>
        </div>
        <PartnerSummaryCard partner={partner} submittedDate={submittedDate} />
      </div>
    );
  }

  // pending
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-[10px] p-6 flex gap-3">
        <Loader2 className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5 animate-spin" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Antrag eingereicht</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-400">
              In Prüfung
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Wir prüfen deinen Antrag in der Regel innerhalb von 2–3 Werktagen.
            Du wirst per E-Mail benachrichtigt, sobald er freigegeben ist.
          </p>
        </div>
      </div>
      <PartnerSummaryCard partner={partner} submittedDate={submittedDate} />
    </div>
  );
}

function PartnerSummaryCard({
  partner,
  submittedDate,
}: {
  partner: RoebelCardPartnerRow;
  submittedDate: string;
}) {
  return (
    <div className="bg-card border border-border rounded-[10px] p-6 space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Eingereichte Daten
      </h3>
      <SummaryRow
        label="Rechtsform"
        value={
          partner.rechtsform ? RECHTSFORM_LABELS[partner.rechtsform] : "—"
        }
      />
      <SummaryRow label="USt-IdNr" value={partner.vat_id ?? "—"} />
      <SummaryRow label="Kontoinhaber" value={partner.account_holder ?? "—"} />
      <SummaryRow
        label="IBAN"
        value={partner.iban_last4 ? `•••• ${partner.iban_last4}` : "—"}
      />
      <SummaryRow label="BIC" value={partner.bic ?? "—"} />
      <SummaryRow label="Eingereicht am" value={submittedDate} />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registration form
// ---------------------------------------------------------------------------

interface RegistrationFormProps {
  accountId: string;
  accountName: string;
  accountAvatarUrl: string | null;
  subTypeLabel: string;
  onCreated: (row: RoebelCardPartnerRow) => void;
}

function RegistrationForm({
  accountId,
  accountName,
  accountAvatarUrl,
  subTypeLabel,
  onCreated,
}: RegistrationFormProps) {
  const [rechtsform, setRechtsform] = useState<Rechtsform | "">("");
  const [vatId, setVatId] = useState("");
  const [ibanInput, setIbanInput] = useState("");
  const [bic, setBic] = useState("");
  const [accountHolder, setAccountHolder] = useState(accountName);
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [authorityAccepted, setAuthorityAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const ibanNormalized = useMemo(() => normalizeIban(ibanInput), [ibanInput]);
  const ibanValid = ibanNormalized.length > 0 && isValidIban(ibanNormalized);
  const ibanShowError = ibanInput.trim().length > 0 && !ibanValid;

  const vatIdTrimmed = vatId.trim();
  const vatIdValid = vatIdTrimmed === "" || VAT_ID_REGEX.test(vatIdTrimmed);

  const bicTrimmed = bic.trim().toUpperCase();
  const bicValid = bicTrimmed === "" || BIC_REGEX.test(bicTrimmed);

  const accountHolderValid = accountHolder.trim().length > 0;

  const canSubmit =
    !!rechtsform &&
    ibanValid &&
    vatIdValid &&
    bicValid &&
    accountHolderValid &&
    agbAccepted &&
    authorityAccepted &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !rechtsform) return;

    setSubmitting(true);
    const t = toast.loading("Antrag wird übermittelt...");
    try {
      const agreementMetadata = await buildAgreementMetadata({
        agbAccepted,
        authorityAccepted,
      });
      const row = await createRoebelCardPartner({
        accountId,
        rechtsform: rechtsform as Rechtsform,
        vatId: vatIdTrimmed || null,
        iban: ibanNormalized,
        bic: bicTrimmed || null,
        accountHolder: accountHolder.trim(),
        agreementMetadata,
      });
      toast.success("Antrag eingereicht", { id: t });
      onCreated(row);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isUnique =
        message.includes("duplicate key") ||
        message.includes("unique constraint") ||
        message.includes("23505");
      toast.error(
        isUnique
          ? "Dein Unternehmen hat bereits einen Antrag eingereicht"
          : "Fehler beim Übermitteln",
        {
          id: t,
          description: isUnique ? undefined : message,
        },
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Section 1 — Unternehmen (read-only) */}
      <section className="bg-card border border-border rounded-[10px] p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Handshake className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Unternehmen
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            {accountAvatarUrl && (
              <AvatarImage src={accountAvatarUrl} alt={accountName} />
            )}
            <AvatarFallback className="bg-muted-foreground/20 text-foreground text-base font-medium">
              {getInitials(accountName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {accountName}
            </p>
            <p className="text-xs text-muted-foreground">{subTypeLabel}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Du registrierst dieses Unternehmen als Röbel Card Partner. Zum Wechsel
          öffne den Konto-Switcher oben rechts.
        </p>
      </section>

      {/* Section 2 — Rechtsform & Steuer */}
      <section className="bg-card border border-border rounded-[10px] p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Rechtsform & Steuer
        </h2>

        <div>
          <Label htmlFor="rechtsform">Rechtsform *</Label>
          <Select
            value={rechtsform || undefined}
            onValueChange={(v) => setRechtsform(v as Rechtsform)}
          >
            <SelectTrigger id="rechtsform" className="mt-1">
              <SelectValue placeholder="Rechtsform auswählen" />
            </SelectTrigger>
            <SelectContent>
              {RECHTSFORM_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {RECHTSFORM_LABELS[opt]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="vatId">USt-IdNr</Label>
          <Input
            id="vatId"
            value={vatId}
            onChange={(e) => setVatId(e.target.value.toUpperCase())}
            placeholder="DE123456789"
            className="mt-1"
            inputMode="text"
            autoComplete="off"
          />
          {!vatIdValid && (
            <p className="text-xs text-red-600 mt-1">
              Ungültige USt-IdNr (Format: DE + 9 Ziffern)
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Freiwillig. Du brauchst keine USt-IdNr, um Partner zu werden.
          </p>
        </div>
      </section>

      {/* Section 3 — Bankverbindung */}
      <section className="bg-card border border-border rounded-[10px] p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Bankverbindung
        </h2>

        <div>
          <Label htmlFor="iban">IBAN *</Label>
          <Input
            id="iban"
            value={ibanInput}
            onChange={(e) => setIbanInput(e.target.value)}
            onBlur={() => setIbanInput((v) => formatIban(v))}
            placeholder="DE89 3704 0044 0532 0130 00"
            className="mt-1 font-mono"
            inputMode="text"
            autoComplete="off"
          />
          {ibanShowError && (
            <p className="text-xs text-red-600 mt-1">
              Ungültige IBAN — bitte prüfe Land und Prüfziffern.
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Wir verschlüsseln deine IBAN serverseitig. Sie ist nur für die
            Auszahlung sichtbar.
          </p>
        </div>

        <div>
          <Label htmlFor="bic">BIC</Label>
          <Input
            id="bic"
            value={bic}
            onChange={(e) => setBic(e.target.value.toUpperCase())}
            placeholder="z.B. NOLADE21NBS"
            className="mt-1 font-mono"
            inputMode="text"
            autoComplete="off"
          />
          {!bicValid && (
            <p className="text-xs text-red-600 mt-1">
              Ungültige BIC (8 oder 11 Stellen).
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Freiwillig — bei deutschen IBANs nicht erforderlich.
          </p>
        </div>

        <div>
          <Label htmlFor="accountHolder">Kontoinhaber *</Label>
          <Input
            id="accountHolder"
            value={accountHolder}
            onChange={(e) => setAccountHolder(e.target.value)}
            className="mt-1"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Vorbelegt mit dem Unternehmensnamen. Anpassen, wenn der
            Kontoinhaber abweicht.
          </p>
        </div>
      </section>

      {/* Section 4 — Vereinbarung */}
      <section className="bg-card border border-border rounded-[10px] p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Vereinbarung
        </h2>

        <label className="flex gap-3 items-start cursor-pointer">
          <Checkbox
            checked={agbAccepted}
            onCheckedChange={(c) => setAgbAccepted(c === true)}
            className="mt-0.5"
          />
          <span className="text-sm text-foreground">
            Ich akzeptiere die{" "}
            <Link
              href="/legal/roebel-card-agb"
              target="_blank"
              className="text-primary underline"
            >
              AGB für Röbel Card Partner
            </Link>{" "}
            sowie die Datenschutz­hinweise.
          </span>
        </label>

        <label className="flex gap-3 items-start cursor-pointer">
          <Checkbox
            checked={authorityAccepted}
            onCheckedChange={(c) => setAuthorityAccepted(c === true)}
            className="mt-0.5"
          />
          <span className="text-sm text-foreground">
            Ich bestätige, vertretungsberechtigt für{" "}
            <span className="font-medium">{accountName}</span> zu sein.
          </span>
        </label>

        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          Mit dem Absenden speichern wir Zeitpunkt, IP-Adresse, Browser- und
          OS-Version sowie die gesetzte Vereinbarungsversion. Diese
          Audit-Daten dienen ausschließlich der Nachweisbarkeit der Annahme
          (Textform §126b BGB).
        </p>
      </section>

      {/* Submit */}
      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit}>
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : null}
          Antrag absenden
        </Button>
      </div>
    </form>
  );
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}
