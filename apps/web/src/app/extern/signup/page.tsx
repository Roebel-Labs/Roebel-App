"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { submitExternSignup } from "@/app/actions/extern-accounts";
import {
  SUB_TYPE_LABELS,
  SUB_TYPE_EMOJI,
  type OrgSubType,
} from "@/types/account";

const EXTERN_SUB_TYPES: OrgSubType[] = [
  "journalist",
  "unternehmen",
  "verein",
  "partei",
  "fraktion",
  "restaurant",
];

export default function ExternSignupPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    sub_type: "journalist" as OrgSubType,
    reason: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.sub_type) {
      toast.error("Bitte alle Pflichtfelder ausfüllen");
      return;
    }
    setSubmitting(true);
    const t = toast.loading("Antrag wird gesendet...");
    const fd = new FormData();
    fd.set("name", form.name);
    fd.set("email", form.email);
    fd.set("sub_type", form.sub_type);
    fd.set("reason", form.reason);
    const res = await submitExternSignup(fd);
    if (res.success) {
      toast.success("Antrag gesendet", { id: t });
      router.push(
        `/extern/pending?email=${encodeURIComponent(form.email)}`
      );
    } else {
      toast.error("Fehler", { id: t, description: res.error });
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Röbel" className="w-8 h-8" />
            <span className="font-medium tracking-tight">Röbel App</span>
          </Link>
          <h1 className="text-2xl font-medium mt-6">
            Externes Organisationskonto
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Für Journalist:innen, Vereine und Unternehmen außerhalb von Röbel,
            die Artikel an die Röbel-Community veröffentlichen möchten.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-5 bg-card border border-border rounded-[10px] p-6"
        >
          <div>
            <Label htmlFor="name">Organisations- oder Markenname *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="mt-1"
              placeholder="z. B. NDR Mecklenburg-Vorpommern"
            />
          </div>
          <div>
            <Label htmlFor="email">Kontakt-E-Mail *</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              className="mt-1"
              placeholder="redaktion@..."
            />
          </div>
          <div>
            <Label>Typ *</Label>
            <Select
              value={form.sub_type}
              onValueChange={(v) =>
                setForm({ ...form, sub_type: v as OrgSubType })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXTERN_SUB_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SUB_TYPE_EMOJI[s]} {SUB_TYPE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="reason">Worum geht es? (optional)</Label>
            <Textarea
              id="reason"
              rows={4}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="mt-1"
              placeholder="Kurz: warum möchtest du auf der Röbel App veröffentlichen?"
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-2" />
            )}
            Antrag senden
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Wir prüfen jeden Antrag manuell und melden uns per E-Mail.
          </p>
        </form>
      </div>
    </div>
  );
}
