"use client";

// "Per URL hinzufügen": register a self-hosted app whose manifest names the
// logged-in wallet as owner.
import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function AddByUrlDialog({
  wallet,
  onRegistered,
}: {
  wallet: string | null;
  onRegistered: (appId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyWallet() {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable: the address stays selectable in the row.
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mini-apps/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, expectedOwner: wallet }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Fehler ${res.status}`);
      setOpen(false);
      setUrl("");
      onRegistered(body.app.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={!wallet}>
        <Link2 className="mr-1 h-3.5 w-3.5" />
        Per URL hinzufügen
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-3">
            <p className="text-base font-semibold">App per URL hinzufügen</p>
            <p className="text-sm text-muted-foreground">
              Deine App muss unter <code>/.well-known/roebel-miniapp.json</code> ein Manifest mit deiner Wallet als{" "}
              <code>owner</code> haben.{" "}
              <Link href="/mini-apps/publish.md" target="_blank" className="text-[#00498B] underline">
                Anleitung
              </Link>
            </p>
            {wallet && (
              <div className="rounded-md border border-border bg-muted/40 p-2">
                <p className="text-xs text-muted-foreground">Deine Wallet für das Manifest (owner)</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all text-xs">{wallet}</code>
                  <Button type="button" size="sm" variant="outline" onClick={copyWallet} aria-label="Wallet-Adresse kopieren">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            )}
            <input
              type="url"
              required
              placeholder="https://meine-app.vercel.app"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-md border border-[#B4B8C1] bg-background px-3 py-2 text-sm"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Prüfe …" : "Hinzufügen"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
