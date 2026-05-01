"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitMerchantInterest } from "@/app/actions/card-interest";

interface MerchantInterestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "error"; message: string; fieldErrors?: Record<string, string> }
  | { kind: "success"; alreadyRegistered: boolean };

const BRANCHES = [
  "Einzelhandel",
  "Gastronomie / Restaurant",
  "Hotel / Pension",
  "Café / Bäckerei",
  "Lebensmittel",
  "Dienstleistung",
  "Freizeit / Tourismus",
  "Handwerk",
  "Sonstiges",
] as const;

export function MerchantInterestModal({ open, onOpenChange }: MerchantInterestModalProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [branche, setBranche] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const handleClose = (next: boolean) => {
    if (!next) {
      setStatus({ kind: "idle" });
      setBranche("");
    }
    onOpenChange(next);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      contactName: String(formData.get("contactName") ?? "").trim(),
      businessName: String(formData.get("businessName") ?? "").trim(),
      address: String(formData.get("address") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      branche: branche.trim(),
    };

    startTransition(async () => {
      const result = await submitMerchantInterest(payload);
      if (result.ok) {
        setStatus({ kind: "success", alreadyRegistered: result.alreadyRegistered });
      } else {
        setStatus({ kind: "error", message: result.error, fieldErrors: result.fieldErrors });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {status.kind === "success" ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
            <DialogHeader className="space-y-2 text-center sm:text-center">
              <DialogTitle className="text-center">
                {status.alreadyRegistered
                  ? "Ihr Geschäft ist schon vorgemerkt!"
                  : "Vielen Dank! Wir melden uns persönlich."}
              </DialogTitle>
              <DialogDescription className="text-center">
                {status.alreadyRegistered
                  ? "Diese E-Mail-Adresse ist bereits als Partner-Geschäft registriert. Wir kontaktieren Sie, sobald die Röbel Card startet."
                  : "Sobald der Verein und das Treuhandkonto eingerichtet sind, kontaktieren wir Sie für ein unverbindliches Gespräch über die Anbindung Ihres Geschäfts."}
              </DialogDescription>
            </DialogHeader>
            <Button onClick={() => handleClose(false)} className="mt-2 w-full">
              Schließen
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Mein Geschäft anmelden</DialogTitle>
              <DialogDescription>
                Tragen Sie Ihr Geschäft kostenlos und unverbindlich ein. Wir melden
                uns persönlich, sobald die Röbel Card startet.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="merchant-contactName">Ihr Name</Label>
                  <Input
                    id="merchant-contactName"
                    name="contactName"
                    type="text"
                    required
                    autoComplete="name"
                    disabled={isPending}
                  />
                  {status.kind === "error" && status.fieldErrors?.contactName && (
                    <p className="text-xs text-destructive">{status.fieldErrors.contactName}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="merchant-businessName">Geschäftsname</Label>
                  <Input
                    id="merchant-businessName"
                    name="businessName"
                    type="text"
                    required
                    autoComplete="organization"
                    disabled={isPending}
                  />
                  {status.kind === "error" && status.fieldErrors?.businessName && (
                    <p className="text-xs text-destructive">{status.fieldErrors.businessName}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="merchant-address">Adresse</Label>
                <Input
                  id="merchant-address"
                  name="address"
                  type="text"
                  required
                  autoComplete="street-address"
                  placeholder="Hauptstr. 12, 17207 Röbel/Müritz"
                  disabled={isPending}
                />
                {status.kind === "error" && status.fieldErrors?.address && (
                  <p className="text-xs text-destructive">{status.fieldErrors.address}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="merchant-phone">Telefon</Label>
                  <Input
                    id="merchant-phone"
                    name="phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    disabled={isPending}
                  />
                  {status.kind === "error" && status.fieldErrors?.phone && (
                    <p className="text-xs text-destructive">{status.fieldErrors.phone}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="merchant-email">E-Mail</Label>
                  <Input
                    id="merchant-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    disabled={isPending}
                  />
                  {status.kind === "error" && status.fieldErrors?.email && (
                    <p className="text-xs text-destructive">{status.fieldErrors.email}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="merchant-branche">Branche</Label>
                <Select value={branche} onValueChange={setBranche} disabled={isPending}>
                  <SelectTrigger id="merchant-branche">
                    <SelectValue placeholder="Branche wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {BRANCHES.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {status.kind === "error" && status.fieldErrors?.branche && (
                  <p className="text-xs text-destructive">{status.fieldErrors.branche}</p>
                )}
              </div>

              {status.kind === "error" && !status.fieldErrors && (
                <p className="text-sm text-destructive">{status.message}</p>
              )}

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Senden …" : "Mein Geschäft anmelden"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Mit dem Absenden stimmen Sie zu, dass wir Sie zur Röbel Card
                kontaktieren dürfen.
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
