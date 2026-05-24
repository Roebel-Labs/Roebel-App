"use client";

import { useMemo, useState } from "react";
import {
  RECHTSFORM_LABELS,
  updatePartnerIban,
} from "@/lib/supabase-roebel-card-partners";
import { usePartner } from "../_components/PartnerContext";
import { formatIban, isValidIban, normalizeIban } from "@/lib/iban";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const STATUS_BADGE = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-400",
  approved: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-400",
  suspended: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-400",
} as const;

const STATUS_LABEL = {
  pending: "In Prüfung",
  approved: "Freigeschaltet",
  rejected: "Abgelehnt",
  suspended: "Pausiert",
} as const;

export default function PartnerSettingsPage() {
  const partner = usePartner();
  const submittedAt = partner.agreement_signed_at ?? partner.created_at;

  const [ibanLast4, setIbanLast4] = useState(partner.iban_last4);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-card border border-border rounded-[10px] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Partner-Profil
          </h2>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[partner.status]}`}
          >
            {STATUS_LABEL[partner.status]}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
          <Row
            label="Rechtsform"
            value={
              partner.rechtsform ? RECHTSFORM_LABELS[partner.rechtsform] : "—"
            }
          />
          <Row label="USt-IdNr" value={partner.vat_id ?? "—"} />
          <Row label="Kontoinhaber" value={partner.account_holder ?? "—"} />
          <Row
            label="BIC"
            value={partner.bic ?? "—"}
            valueClass="font-mono"
          />
          <Row
            label="IBAN"
            value={ibanLast4 ? `•••• ${ibanLast4}` : "—"}
            valueClass="font-mono"
          />
          <Row
            label="Eingereicht am"
            value={formatGermanDate(submittedAt)}
          />
          {partner.approved_at ? (
            <Row
              label="Freigegeben am"
              value={formatGermanDate(partner.approved_at)}
            />
          ) : null}
          {partner.agreement_version ? (
            <Row
              label="AGB-Version"
              value={partner.agreement_version}
              valueClass="font-mono"
            />
          ) : null}
        </div>

        <div className="pt-3 border-t border-border flex justify-end">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                IBAN aktualisieren
              </Button>
            </DialogTrigger>
            <UpdateIbanDialog
              partnerId={partner.id}
              onUpdated={(last4) => {
                setIbanLast4(last4);
                setDialogOpen(false);
              }}
            />
          </Dialog>
        </div>
      </div>

      <div className="bg-muted/40 border border-border rounded-[10px] p-4 text-sm text-muted-foreground">
        Brauchst du andere Stammdaten anpassen (Rechtsform, USt-IdNr,
        Kontoinhaber)? Schreib uns an{" "}
        <a
          href="mailto:partner@roebel.app"
          className="text-primary underline"
        >
          partner@roebel.app
        </a>
        .
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-foreground${valueClass ? ` ${valueClass}` : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function UpdateIbanDialog({
  partnerId,
  onUpdated,
}: {
  partnerId: string;
  onUpdated: (last4: string) => void;
}) {
  const [ibanInput, setIbanInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const ibanNormalized = useMemo(() => normalizeIban(ibanInput), [ibanInput]);
  const ibanValid = ibanNormalized.length > 0 && isValidIban(ibanNormalized);
  const ibanShowError = ibanInput.trim().length > 0 && !ibanValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ibanValid || submitting) return;
    setSubmitting(true);
    const t = toast.loading("IBAN wird aktualisiert...");
    try {
      await updatePartnerIban(partnerId, ibanNormalized);
      toast.success("IBAN aktualisiert", { id: t });
      onUpdated(ibanNormalized.slice(-4));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Fehler beim Aktualisieren", { id: t, description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>IBAN aktualisieren</DialogTitle>
        <DialogDescription>
          Die IBAN wird serverseitig verschlüsselt. Sichtbar bleibt nur die
          Endziffer.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label htmlFor="iban-update">Neue IBAN</Label>
          <Input
            id="iban-update"
            value={ibanInput}
            onChange={(e) => setIbanInput(e.target.value)}
            onBlur={() => setIbanInput((v) => formatIban(v))}
            placeholder="DE89 3704 0044 0532 0130 00"
            className="mt-1 font-mono"
            autoComplete="off"
          />
          {ibanShowError ? (
            <p className="text-xs text-red-600 mt-1">
              Ungültige IBAN — bitte prüfe Land und Prüfziffern.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={!ibanValid || submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Aktualisieren
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function formatGermanDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
