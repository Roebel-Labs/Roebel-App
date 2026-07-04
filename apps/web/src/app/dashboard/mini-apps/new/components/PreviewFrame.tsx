"use client";

// Live preview: the generated single-file app runs in a sandboxed srcdoc iframe
// wired to the real Netizen web host bridge (via useMiniAppHost) — ready()/
// context/balance/track all settle like in the Röbel app.
import { useRef } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMiniAppHost } from "../lib/useMiniAppHost";

export function PreviewFrame({ html, appName }: { html: string | null; appName: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { ready, calls, reload, reloadKey } = useMiniAppHost(iframeRef, { html, appName });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-[10px] border border-border bg-background">
      {/* Bauplan stage — construction-plan grid behind the device */}
      <div
        aria-hidden
        className="absolute inset-0 [background-size:24px_24px] [background-image:linear-gradient(to_right,rgba(0,73,139,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,73,139,0.06)_1px,transparent_1px)] dark:[background-image:linear-gradient(to_right,rgba(122,187,242,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(122,187,242,0.06)_1px,transparent_1px)]"
      />

      {html ? (
        <>
          <div className="relative z-10 my-4 flex min-h-0 flex-1 items-center">
            <div className="relative h-[min(72vh,700px)] w-[360px] max-w-full overflow-hidden rounded-[28px] border border-border bg-black p-1.5 shadow-xl">
              <iframe
                key={reloadKey}
                ref={iframeRef}
                srcDoc={html}
                title={`Vorschau: ${appName}`}
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                className="h-full w-full rounded-[20px] border-0 bg-white"
              />
              {!ready && (
                <div className="pointer-events-none absolute inset-1.5 flex flex-col items-center justify-center gap-2 rounded-[20px] bg-white/95 text-center dark:bg-[#202124]/95">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="px-6 text-xs text-muted-foreground">
                    Splash, bis die App <span className="font-mono">ready()</span> ruft
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* status strip */}
          <div className="relative z-10 mb-3 flex w-full max-w-[520px] items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  ready ? "bg-success" : "animate-pulse bg-warning",
                )}
              />
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {ready
                  ? calls[0]
                    ? `${calls[0].method} ${calls[0].ok ? "✓" : "✕"} · ${calls.length} Bridge-Aufrufe`
                    : "ready() empfangen"
                  : "Wartet auf ready()…"}
              </span>
            </div>
            <button
              type="button"
              onClick={reload}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RefreshCw className="h-3 w-3" /> Neu laden
            </button>
          </div>
        </>
      ) : (
        <div className="relative z-10 px-8 text-center">
          <p className="text-sm font-medium text-foreground">Noch keine Vorschau</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sobald die erste Version gebaut ist, läuft sie hier — mit echter Verbindung zum
            Röbel-Host.
          </p>
        </div>
      )}
    </div>
  );
}
