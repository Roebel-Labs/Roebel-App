"use client";

// Source panel for self-hosted (indexed) apps: where the manifest lives, when
// it was last read, the last error, and a manual re-index.
import { useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { MiniAppRow } from "@/lib/miniapp/types";
import { timeAgo } from "@/components/admin/muenzen/format";

export function IndexedSourceCard({
  app,
  wallet,
  onReindexed,
  admin = false,
}: {
  app: MiniAppRow;
  wallet: string | null;
  onReindexed: () => void;
  admin?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reindex() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/mini-apps/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: app.origin, ...(admin || !wallet ? {} : { expectedOwner: wallet }) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Fehler ${res.status}`);
      setMsg(
        body.outcome === "touch"
          ? "Keine Änderungen am Manifest."
          : body.app.pending_update
            ? "Neue Version erkannt — geht nach der Prüfung live."
            : "Manifest übernommen.",
      );
      onReindexed();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Eigenes Hosting</p>
          <a href={app.manifest_url ?? "#"} target="_blank" rel="noreferrer" className="block truncate text-xs text-[#00498B] underline">
            {app.manifest_url}
          </a>
          <p className="mt-1 text-xs text-muted-foreground">
            Zuletzt gelesen: {app.last_indexed_at ? timeAgo(Date.parse(app.last_indexed_at)) : "—"}
            {app.pending_update ? " · Update in Prüfung" : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={reindex} disabled={busy}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          Manifest neu laden
        </Button>
      </div>
      {app.index_error && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {app.index_error}
        </p>
      )}
      {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
    </Card>
  );
}
