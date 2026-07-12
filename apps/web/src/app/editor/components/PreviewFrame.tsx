"use client";

// Live preview: the generated single-file app runs in a sandboxed srcdoc iframe
// wired to the real Netizen web host bridge (via useMiniAppHost) — ready()/
// context/balance/track all settle like in the Röbel app. The preview document
// is augmented (inspect.ts) with an element inspector ("Bearbeiten") and a
// runtime-error reporter; published HTML stays clean.
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, MousePointerClick, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { augmentPreviewHtml, type InspectedElement, type RuntimeError } from "../lib/inspect";
import { useMiniAppHost } from "../lib/useMiniAppHost";

const CAPTURE_TIMEOUT_MS = 10_000;

export function PreviewFrame({
  html,
  appName,
  appSlug,
  wallet,
  onInspect,
  onRuntimeError,
}: {
  html: string | null;
  appName: string;
  /** Slug of the published app — screenshots need an app row to attach to. */
  appSlug?: string | null;
  wallet?: string | null;
  /** Called when the user picks an element in "Bearbeiten" mode. */
  onInspect?: (el: InspectedElement) => void;
  /** Called (deduped in-page) for every runtime error the preview reports. */
  onRuntimeError?: (err: RuntimeError) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewHtml = useMemo(() => (html ? augmentPreviewHtml(html) : null), [html]);
  const { ready, calls, reload, reloadKey } = useMiniAppHost(iframeRef, {
    html: previewHtml,
    appName,
  });
  const [shotState, setShotState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [shotMsg, setShotMsg] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);

  // Inspector wiring: toggle state into the frame, listen for picks + errors.
  useEffect(() => {
    const frame = iframeRef.current?.contentWindow;
    if (frame) frame.postMessage({ type: "netizen:inspect", enabled: inspecting }, "*");
  }, [inspecting, reloadKey, ready]);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow || !e.data) return;
      if (e.data.type === "netizen:inspect:pick" && e.data.element) {
        setInspecting(false);
        onInspect?.(e.data.element as InspectedElement);
      } else if (e.data.type === "netizen:runtime-error" && e.data.message) {
        onRuntimeError?.({
          message: String(e.data.message),
          source: String(e.data.source ?? "error"),
        });
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onInspect, onRuntimeError]);

  // A new document ends any active inspection.
  useEffect(() => {
    setInspecting(false);
  }, [html]);

  // Kurzlebige Statusanzeige zurücksetzen
  useEffect(() => {
    if (shotState !== "done" && shotState !== "error") return;
    const t = setTimeout(() => {
      setShotState("idle");
      setShotMsg(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [shotState]);

  async function captureShot() {
    const frame = iframeRef.current?.contentWindow;
    if (!frame || !appSlug || !wallet || shotState === "busy") return;
    setShotState("busy");
    setShotMsg(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          window.removeEventListener("message", onMsg);
          reject(
            new Error(
              "Keine Antwort von der App — generiere sie neu, um Screenshots zu aktivieren.",
            ),
          );
        }, CAPTURE_TIMEOUT_MS);
        function onMsg(e: MessageEvent) {
          if (e.source !== frame || !e.data) return;
          if (e.data.type === "netizen:capture:result") {
            clearTimeout(timer);
            window.removeEventListener("message", onMsg);
            resolve(e.data.dataUrl as string);
          } else if (e.data.type === "netizen:capture:error") {
            clearTimeout(timer);
            window.removeEventListener("message", onMsg);
            reject(new Error(String(e.data.error ?? "Screenshot fehlgeschlagen.")));
          }
        }
        window.addEventListener("message", onMsg);
        frame.postMessage({ type: "netizen:capture" }, "*");
      });

      const blob = await (await fetch(dataUrl)).blob();
      const form = new FormData();
      form.set("appId", appSlug);
      form.set("kind", "shot");
      form.set("file", new File([blob], "screenshot.png", { type: "image/png" }));
      const res = await fetch("/api/mini-apps/images/upload", {
        method: "POST",
        headers: { "x-wallet-address": wallet },
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setShotState("done");
      setShotMsg("Screenshot gespeichert — im Dashboard unter „Bilder“.");
    } catch (e) {
      setShotState("error");
      setShotMsg(e instanceof Error ? e.message : String(e));
    }
  }

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
                srcDoc={previewHtml ?? undefined}
                title={`Vorschau: ${appName}`}
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                className="h-full w-full rounded-[20px] border-0 bg-white"
              />
              {/* Home-indicator overlay: the preview host reports a 34px bottom
                  inset — this pill sits inside it, so unpadded bottom bars are
                  visibly covered (exactly like on a real device). */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-1.5 bottom-1.5 z-10 flex h-[34px] items-center justify-center rounded-b-[20px]"
              >
                <span className="h-[5px] w-[120px] rounded-full bg-foreground/25" />
              </div>
              {inspecting && (
                <div className="pointer-events-none absolute inset-x-1.5 top-1.5 z-10 rounded-t-[20px] bg-primary/90 px-3 py-1.5 text-center text-[11px] font-medium text-primary-foreground">
                  Element anklicken, das geändert werden soll
                </div>
              )}
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
                {shotMsg ??
                  (ready
                    ? calls[0]
                      ? `${calls[0].method} ${calls[0].ok ? "✓" : "✕"} · ${calls.length} Bridge-Aufrufe`
                      : "ready() empfangen"
                    : "Wartet auf ready()…")}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setInspecting((v) => !v)}
                title="Bearbeiten-Modus: Element in der Vorschau anklicken und die nächste Änderung gezielt darauf beziehen"
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px]",
                  inspecting
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <MousePointerClick className="h-3 w-3" />
                Bearbeiten
              </button>
              <button
                type="button"
                onClick={captureShot}
                disabled={!appSlug || !wallet || shotState === "busy"}
                title={
                  appSlug
                    ? "Screenshot für die Store-Vorschau aufnehmen"
                    : "Zuerst veröffentlichen — dann kannst du Screenshots speichern"
                }
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                {shotState === "busy" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Camera className="h-3 w-3" />
                )}
                Screenshot
              </button>
              <button
                type="button"
                onClick={reload}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RefreshCw className="h-3 w-3" /> Neu laden
              </button>
            </div>
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
