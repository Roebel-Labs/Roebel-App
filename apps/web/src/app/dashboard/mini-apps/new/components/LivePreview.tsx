"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Smartphone, TriangleAlert } from "lucide-react";
import type { PartialFile } from "../lib/streamParse";

/**
 * Live preview: renders the generated primary screen inside a sandboxed,
 * phone-sized iframe wired to the mock Netizen host bridge. Calls the
 * server-side preview renderer (POST /api/mini-apps/generate/preview) whenever
 * the files change (debounced), so the builder SEES the app working with mock
 * user + balance + rewards before publishing.
 */
export function LivePreview({
  files,
  streaming,
}: {
  files: PartialFile[];
  streaming: boolean;
}) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);

  // Only fully-formed files (both path + content) are renderable.
  const renderable = files.filter(
    (f): f is Required<PartialFile> =>
      typeof f.path === "string" && typeof f.content === "string" && f.content.length > 0,
  );
  const hasPage = renderable.some((f) => f.path === "app/page.tsx" || f.path === "app/page.jsx");
  const signature = renderable.map((f) => `${f.path}:${f.content.length}`).join("|");

  async function refresh(list: Required<PartialFile>[]) {
    const myId = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mini-apps/generate/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files: list }),
      });
      const data = (await res.json()) as { ok: boolean; html: string; error?: string };
      if (myId !== reqId.current) return; // superseded
      if (data.html) setHtml(data.html);
      if (!data.ok && data.error) setError(data.error);
      else setError(null);
    } catch (e) {
      if (myId !== reqId.current) return;
      setError(e instanceof Error ? e.message : "Vorschau fehlgeschlagen");
    } finally {
      if (myId === reqId.current) setLoading(false);
    }
  }

  // Debounced auto-refresh while streaming; immediate once idle with a page.
  useEffect(() => {
    if (!hasPage) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = streaming ? 900 : 150;
    debounceRef.current = setTimeout(() => refresh(renderable), delay);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, hasPage, streaming]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="flex items-center gap-1.5 font-heading text-sm font-semibold text-foreground">
          <Smartphone className="h-3.5 w-3.5" /> Live-Vorschau
        </span>
        <div className="flex items-center gap-2">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
          <button
            type="button"
            onClick={() => hasPage && refresh(renderable)}
            disabled={!hasPage || loading}
            className="flex items-center gap-1 rounded-[10px] px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
            title="Neu laden"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-muted/40 p-4">
        {!hasPage ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <Smartphone className="h-8 w-8 opacity-40" />
            <p>{streaming ? "Warte auf app/page.tsx…" : "Noch keine Vorschau."}</p>
          </div>
        ) : (
          <div className="w-full max-w-[360px]">
            {/* phone frame — 360px wide, the mini-app modal target width */}
            <div className="mx-auto overflow-hidden rounded-[24px] border-[6px] border-foreground/80 bg-background shadow-lg">
              <iframe
                title="Mini-App Vorschau"
                srcDoc={html || "<!doctype html><body></body>"}
                sandbox="allow-scripts"
                className="h-[640px] w-full border-0 bg-background"
              />
            </div>
            {error ? (
              <p className="mt-2 flex items-start gap-1 text-[11px] text-destructive">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="break-words">{error}</span>
              </p>
            ) : (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Mock-Host: Test-Bürger:in · 48,00 RÖ
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
