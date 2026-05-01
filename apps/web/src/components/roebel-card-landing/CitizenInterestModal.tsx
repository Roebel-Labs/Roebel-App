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
import { submitCitizenInterest } from "@/app/actions/card-interest";

interface CitizenInterestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "error"; message: string; fieldErrors?: Record<string, string> }
  | { kind: "success"; alreadyRegistered: boolean };

export function CitizenInterestModal({ open, onOpenChange }: CitizenInterestModalProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  const handleClose = (next: boolean) => {
    if (!next) setStatus({ kind: "idle" });
    onOpenChange(next);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? "").trim(),
      plz: String(formData.get("plz") ?? "").trim(),
      firstName: String(formData.get("firstName") ?? "").trim(),
    };

    startTransition(async () => {
      const result = await submitCitizenInterest(payload);
      if (result.ok) {
        setStatus({ kind: "success", alreadyRegistered: result.alreadyRegistered });
      } else {
        setStatus({ kind: "error", message: result.error, fieldErrors: result.fieldErrors });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {status.kind === "success" ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
            <DialogHeader className="space-y-2 text-center sm:text-center">
              <DialogTitle className="text-center">
                {status.alreadyRegistered
                  ? "Sie sind schon dabei!"
                  : "Danke! Wir melden uns, sobald die Karte startet."}
              </DialogTitle>
              <DialogDescription className="text-center">
                {status.alreadyRegistered
                  ? "Diese E-Mail-Adresse steht bereits auf der Interessenten-Liste. Wir kontaktieren Sie, sobald die Röbel Card startet."
                  : "Wir haben Sie auf die Interessenten-Liste gesetzt. Sie erhalten in Kürze eine Bestätigungs-E-Mail."}
              </DialogDescription>
            </DialogHeader>
            <Button onClick={() => handleClose(false)} className="mt-2 w-full">
              Schließen
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Ich bin interessiert</DialogTitle>
              <DialogDescription>
                Tragen Sie sich kostenlos und unverbindlich ein. Wir melden uns,
                sobald die Röbel Card startet.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="citizen-email">E-Mail-Adresse</Label>
                <Input
                  id="citizen-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="ihre@email.de"
                  disabled={isPending}
                />
                {status.kind === "error" && status.fieldErrors?.email && (
                  <p className="text-xs text-destructive">{status.fieldErrors.email}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="citizen-plz">Postleitzahl</Label>
                <Input
                  id="citizen-plz"
                  name="plz"
                  inputMode="numeric"
                  pattern="\d{5}"
                  maxLength={5}
                  required
                  autoComplete="postal-code"
                  placeholder="17207"
                  disabled={isPending}
                />
                {status.kind === "error" && status.fieldErrors?.plz && (
                  <p className="text-xs text-destructive">{status.fieldErrors.plz}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="citizen-firstName">
                  Vorname <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="citizen-firstName"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  placeholder="Max"
                  disabled={isPending}
                />
              </div>

              {status.kind === "error" && !status.fieldErrors && (
                <p className="text-sm text-destructive">{status.message}</p>
              )}

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Senden …" : "Ich bin interessiert"}
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
