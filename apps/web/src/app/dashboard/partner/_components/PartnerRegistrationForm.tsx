"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  createRoebelCardPartner,
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
import { Handshake, Loader2 } from "lucide-react";
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

interface Props {
  accountId: string;
  accountName: string;
  accountAvatarUrl: string | null;
  subTypeLabel: string;
  onCreated: (row: RoebelCardPartnerRow) => void;
}

export function PartnerRegistrationForm({
  accountId,
  accountName,
  accountAvatarUrl,
  subTypeLabel,
  onCreated,
}: Props) {
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
          OS-Version sowie die gesetzte Vereinbarungsversion. Diese Audit-Daten
          dienen ausschließlich der Nachweisbarkeit der Annahme (Textform §126b
          BGB).
        </p>
      </section>

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
