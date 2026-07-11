"use client";

// Post-publish runner: captures every app screen offscreen and lets the KIE
// image model (Seedream 4.5) fill the store entry (raster icon, 16:9 hero,
// 1:1 previews with the screenshots as reference). Shows a floating progress
// card bottom-right; the images land directly on the app row ("Bilder").
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Minus, Sparkles, X } from "lucide-react";
import {
  runAutoStoreImages,
  type AutoImageItem,
} from "../lib/autoStoreImages";

const HIDE_AFTER_DONE_MS = 8000;

function StatusIcon({ status }: { status: AutoImageItem["status"] }) {
  if (status === "done") return <Check className="h-3.5 w-3.5 text-success" />;
  if (status === "error") return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  if (status === "running")
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  if (status === "skipped") return <Minus className="h-3.5 w-3.5 text-muted-foreground/60" />;
  return <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />;
}

export function AutoStoreImages({
  html,
  slug,
  wallet,
  force,
}: {
  html: string;
  slug: string;
  wallet: string;
  /** Regenerate everything (fresh captures, existing images replaced). */
  force?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [items, setItems] = useState<AutoImageItem[]>([]);
  const [phase, setPhase] = useState<"running" | "done" | "failed">("running");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (started.current || !containerRef.current) return;
    started.current = true;
    let alive = true;

    runAutoStoreImages({
      html,
      slug,
      wallet,
      force,
      container: containerRef.current,
      onProgress: (next) => {
        if (alive) setItems(next);
      },
      isCancelled: () => !alive,
    })
      .then(() => {
        if (alive) setPhase("done");
      })
      .catch(() => {
        if (alive) setPhase("failed");
      });

    return () => {
      alive = false;
    };
  }, [html, slug, wallet, force]);

  useEffect(() => {
    if (phase !== "done") return;
    const anyError = items.some((it) => it.status === "error");
    if (anyError) return; // Fehler sichtbar lassen, bis der Nutzer schließt
    const t = setTimeout(() => setVisible(false), HIDE_AFTER_DONE_MS);
    return () => clearTimeout(t);
  }, [phase, items]);

  const nothingToDo = items.length > 0 && items.every((it) => it.status === "skipped");

  return (
    <>
      {/* Offscreen, aber gerendert — die Capture-iframes brauchen echtes Layout. */}
      <div
        ref={containerRef}
        aria-hidden
        className="pointer-events-none fixed left-[-9999px] top-0"
      />

      {visible && !nothingToDo ? (
        <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-border bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Store-Bilder werden erstellt
            </p>
            <button
              type="button"
              aria-label="Schließen"
              onClick={() => setVisible(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {items.length === 0 ? (
            <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Wird vorbereitet …
            </p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((it) => (
                <li key={it.key} className="flex items-start gap-2 text-xs">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    <StatusIcon status={it.status} />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={
                        it.status === "skipped"
                          ? "text-muted-foreground/60"
                          : "text-foreground"
                      }
                    >
                      {it.label}
                    </span>
                    {it.detail ? (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {it.detail}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-[11px] text-muted-foreground">
            {phase === "running"
              ? "Tab geöffnet lassen, bis alles fertig ist. Die Bilder erscheinen im Dashboard unter „Bilder“."
              : phase === "failed" || items.some((it) => it.status === "error")
                ? "Einige Bilder konnten nicht erstellt werden — im Dashboard unter „Bilder“ kannst du sie manuell generieren."
                : "Fertig — Icon, Artwork und Vorschauen liegen im Dashboard unter „Bilder“."}
          </p>
        </div>
      ) : null}
    </>
  );
}
