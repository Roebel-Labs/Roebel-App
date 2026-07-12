"use client";

// KI-Studio sidebar for ONE store-image target (icon / hero / preview slot) —
// the Speisekarte AiImageEditor pattern: variants generate as previews (never
// auto-committed), compare against the current image via slider, commit
// explicitly ("Übernehmen"). Base options: fresh prompt, edit of the current
// image, or (previews) an editor screenshot as reference.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageCompareSlider } from "@/components/dashboard/speisekarte/image-compare-slider";
import type { MiniAppRow } from "@/lib/miniapp/types";

export type StudioKind = "icon" | "feature" | "preview";

const POLL_MS = 2500;
const POLL_BUDGET_MS = 150_000;
// Paced progress estimate — Seedream jobs usually land well under this.
const GENERATION_BUDGET_S = 60;
const VARIANTS_LIMIT = 6;

const TITLES: Record<StudioKind, string> = {
  icon: "App-Icon",
  feature: "Store-Artwork (16:9)",
  preview: "Store-Vorschau",
};

type Base = { mode: "fresh" } | { mode: "current" } | { mode: "shot"; url: string };

const variantsKey = (appId: string, kind: StudioKind, slot?: number) =>
  `roebel:miniapp-variants:${appId}:${kind}:${slot ?? 0}`;
const refsKey = (appId: string) => `roebel:miniapp-refs:${appId}`;
const REFS_LIMIT = 4;

/** Collect image URLs out of arbitrary Mini-CMS values (strings/arrays/objects). */
function collectImageUrls(value: unknown, into: Set<string>): void {
  if (typeof value === "string") {
    if (
      /^https:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(value) ||
      (value.startsWith("https://") &&
        value.includes("/storage/v1/object/public/images/mini-apps/"))
    ) {
      into.add(value);
    }
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectImageUrls(v, into));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectImageUrls(v, into));
  }
}

async function apiJson(
  url: string,
  wallet: string | null,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(wallet ? { "x-wallet-address": wallet } : {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
  }
  return json;
}

export function ImageStudio({
  app,
  wallet,
  kind,
  slot,
  onClose,
  onChanged,
}: {
  app: MiniAppRow;
  wallet: string | null;
  kind: StudioKind;
  slot?: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const currentUrl =
    kind === "icon"
      ? app.icon_url
      : kind === "feature"
        ? app.feature_image_url ?? null
        : (app.screenshots ?? [])[slot ?? 0] ?? null;
  // data:-URI icons (SVG draft) can't be a KIE reference.
  const canEditCurrent = !!currentUrl?.startsWith("https://");
  const aspectClass = kind === "feature" ? "aspect-[16/9]" : "aspect-square";

  const [prompt, setPrompt] = useState("");
  const [base, setBase] = useState<Base>({ mode: "fresh" });
  const [variants, setVariants] = useState<string[]>([]);
  const [compareUrl, setCompareUrl] = useState<string | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [cmsImages, setCmsImages] = useState<string[]>([]);
  const [refs, setRefs] = useState<string[]>([]);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const refInput = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  // Variants persist per target on this device (like the Speisekarte editor).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(variantsKey(app.id, kind, slot));
      setVariants(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setVariants([]);
    }
    setCompareUrl(null);
  }, [app.id, kind, slot]);

  const persistVariants = useCallback(
    (next: string[]) => {
      setVariants(next);
      try {
        window.localStorage.setItem(variantsKey(app.id, kind, slot), JSON.stringify(next));
      } catch {
        // localStorage unavailable (private window) — silent
      }
    },
    [app.id, kind, slot],
  );

  // Screenshot pool for preview references.
  useEffect(() => {
    if (kind !== "preview") return;
    apiJson(`/api/mini-apps/images/upload?appId=${app.id}`, wallet)
      .then((j) => {
        if (!cancelled.current && Array.isArray(j.shots)) setShots(j.shots as string[]);
      })
      .catch(() => {});
  }, [app.id, kind, wallet]);

  // Mini-CMS content images (Inhalte) as reference candidates — the app's
  // real photos (e.g. Produktbilder) usually live there. Fails soft.
  useEffect(() => {
    apiJson(`/api/mini-apps/data?app=${app.id}&scope=app`, wallet)
      .then((j) => {
        if (cancelled.current || !Array.isArray(j.items)) return;
        const urls = new Set<string>();
        (j.items as { value?: unknown }[]).forEach((it) => collectImageUrls(it.value, urls));
        setCmsImages([...urls].slice(0, 12));
      })
      .catch(() => {});
  }, [app.id, wallet]);

  // Own uploaded reference images (device-local list, app-wide).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(refsKey(app.id));
      setRefs(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setRefs([]);
    }
  }, [app.id]);

  const persistRefs = useCallback(
    (next: string[]) => {
      setRefs(next);
      try {
        window.localStorage.setItem(refsKey(app.id), JSON.stringify(next));
      } catch {
        // localStorage unavailable — silent
      }
    },
    [app.id],
  );

  async function uploadReference(file: File) {
    setError(null);
    setUploadingRef(true);
    try {
      const form = new FormData();
      form.set("appId", app.id);
      form.set("kind", "shot");
      form.set("file", file);
      const res = await fetch(`/api/mini-apps/images/upload`, {
        method: "POST",
        headers: wallet ? { "x-wallet-address": wallet } : undefined,
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || typeof json.url !== "string") {
        throw new Error(typeof json.error === "string" ? json.error : `HTTP ${res.status}`);
      }
      persistRefs([json.url, ...refs.filter((r) => r !== json.url)].slice(0, REFS_LIMIT));
      setBase({ mode: "shot", url: json.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingRef(false);
    }
  }

  // Paced progress while a variant generates (capped at 95%).
  useEffect(() => {
    if (!generating) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250);
    return () => window.clearInterval(id);
  }, [generating]);
  const progress = Math.min(95, (elapsed / GENERATION_BUDGET_S) * 100);

  const needsPrompt = base.mode === "current";

  async function generateVariant() {
    if (generating) return;
    if (needsPrompt && !prompt.trim()) {
      setError("Beschreibe zuerst, was am aktuellen Bild geändert werden soll.");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const referenceUrl =
        base.mode === "current" && canEditCurrent
          ? currentUrl!
          : base.mode === "shot"
            ? base.url
            : undefined;
      const { taskId } = (await apiJson(`/api/mini-apps/images`, wallet, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appId: app.id,
          kind,
          slot,
          prompt: prompt.trim() || undefined,
          referenceUrl,
          mode: base.mode === "current" ? "edit" : undefined,
        }),
      })) as { taskId: string };

      const deadline = Date.now() + POLL_BUDGET_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (cancelled.current) return;
        const params = new URLSearchParams({ taskId, appId: app.id, kind, preview: "1" });
        if (slot !== undefined) params.set("slot", String(slot));
        const st = await apiJson(`/api/mini-apps/images/status?${params}`, wallet);
        if (st.status === "done" && typeof st.url === "string") {
          const next = [st.url, ...variants.filter((v) => v !== st.url)].slice(
            0,
            VARIANTS_LIMIT,
          );
          persistVariants(next);
          setCompareUrl(st.url);
          return;
        }
        if (st.status === "error") {
          throw new Error(
            typeof st.error === "string" ? st.error : "Generierung fehlgeschlagen.",
          );
        }
      }
      throw new Error("Zeitüberschreitung — bitte versuche es erneut.");
    } catch (e) {
      if (!cancelled.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelled.current) setGenerating(false);
    }
  }

  async function commit(url: string) {
    if (committing) return;
    setError(null);
    setCommitting(true);
    try {
      await apiJson(`/api/mini-apps/images/commit`, wallet, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId: app.id, kind, slot, url }),
      });
      setCompareUrl(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
    }
  }

  const busy = generating || committing;
  const title =
    kind === "preview" ? `${TITLES.preview} · Slot ${(slot ?? 0) + 1}` : TITLES[kind];

  const baseChip = (active: boolean) =>
    active
      ? "rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
      : "rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted";

  return (
    <>
      <button
        type="button"
        aria-label="Studio schließen"
        onClick={onClose}
        className="fixed inset-0 z-[65] bg-black/40 backdrop-blur-[2px]"
      />
      <aside className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> KI-Studio · {title}
          </p>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {/* Stage: compare when a variant is selected, otherwise current image */}
          <div className="relative">
            {compareUrl && canEditCurrent && compareUrl !== currentUrl ? (
              <ImageCompareSlider
                oldUrl={currentUrl!}
                newUrl={compareUrl}
                aspectClass={aspectClass}
              />
            ) : (
              <div
                className={`relative w-full ${aspectClass} overflow-hidden rounded-md border border-border bg-muted`}
              >
                {compareUrl || currentUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={(compareUrl ?? currentUrl) as string}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Noch kein Bild
                  </div>
                )}
              </div>
            )}
            {generating ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-md bg-background/80 px-6 backdrop-blur-[1px]">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm font-medium">
                  {elapsed < 5
                    ? "Prompt wird vorbereitet…"
                    : elapsed < 45
                      ? "Bild wird generiert…"
                      : "Wird gespeichert…"}
                </p>
                <div className="w-full max-w-[240px]">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                    {Math.floor(elapsed)}s · bis zu {GENERATION_BUDGET_S}s
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {compareUrl ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={busy}
                onClick={() => commit(compareUrl)}
              >
                {committing ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                )}
                Übernehmen
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCompareUrl(null)}>
                Verwerfen
              </Button>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : null}

          {/* Base selection */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Ausgangspunkt</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => setBase({ mode: "fresh" })}
                className={baseChip(base.mode === "fresh")}
              >
                Neu generieren
              </button>
              {canEditCurrent ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setBase({ mode: "current" })}
                  className={baseChip(base.mode === "current")}
                >
                  Aktuelles Bild bearbeiten
                </button>
              ) : null}
            </div>
          </div>

          {/* Vorlagen: eigene Referenzbilder + CMS-Inhalte + Editor-Screenshots */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {kind === "preview"
                ? "Vorlage wählen — Referenzbild, CMS-Bild oder Screenshot (kurze Bildunterschrift kommt automatisch)"
                : "Vorlage wählen (optional) — eigenes Referenzbild oder Bild aus den Inhalten"}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[
                ...refs,
                ...cmsImages.filter((u) => !refs.includes(u)),
                ...(kind === "preview"
                  ? shots.filter((u) => !refs.includes(u) && !cmsImages.includes(u))
                  : []),
              ]
                .slice(0, 11)
                .map((s) => {
                  const active = base.mode === "shot" && base.url === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onClick={() => setBase(active ? { mode: "fresh" } : { mode: "shot", url: s })}
                      className={`relative aspect-square overflow-hidden rounded-lg border ${
                        active
                          ? "border-primary ring-2 ring-primary"
                          : "border-border hover:border-foreground/40"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s} alt="Vorlage" className="h-full w-full object-cover" />
                    </button>
                  );
                })}
              <button
                type="button"
                disabled={busy || uploadingRef}
                onClick={() => refInput.current?.click()}
                aria-label="Referenzbild hochladen"
                title="Eigenes Referenzbild hochladen"
                className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/60 hover:text-foreground disabled:opacity-50"
              >
                {uploadingRef ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
              </button>
            </div>
            <input
              ref={refInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadReference(file);
              }}
            />
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {base.mode === "current"
                ? "Gewünschte Änderung"
                : "Wunsch für die KI (Stil, Motiv, Stimmung — optional)"}
            </p>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              disabled={busy}
              placeholder={
                base.mode === "current"
                  ? "z. B. Hintergrund heller machen, Motiv beibehalten"
                  : "z. B. verspielt, mit Leuchtturm-Motiv"
              }
              className="resize-none text-sm"
            />
          </div>

          <Button className="w-full" size="sm" disabled={busy} onClick={generateVariant}>
            {generating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            {generating
              ? `Generiere… ${Math.round(progress)}%`
              : base.mode === "current"
                ? "Bearbeitete Variante erstellen"
                : base.mode === "shot"
                  ? "Variante aus Vorlage erstellen"
                  : "Variante generieren"}
          </Button>

          {/* Variants */}
          {variants.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Varianten — antippen zum Vergleichen, dann „Übernehmen“
              </p>
              <div className="grid grid-cols-3 gap-2">
                {variants.map((url) => {
                  const isComparing = url === compareUrl;
                  const isCommitted = url === currentUrl;
                  return (
                    <div key={url} className="group relative">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setCompareUrl(url)}
                        className={`relative w-full ${aspectClass} overflow-hidden rounded-md border transition-colors ${
                          isComparing
                            ? "border-primary ring-2 ring-primary"
                            : isCommitted
                              ? "border-primary"
                              : "border-border hover:border-foreground/40"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Variante" className="h-full w-full object-cover" />
                      </button>
                      <button
                        type="button"
                        aria-label="Variante verwerfen"
                        disabled={busy}
                        onClick={() => {
                          persistVariants(variants.filter((v) => v !== url));
                          if (compareUrl === url) setCompareUrl(null);
                        }}
                        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <p className="text-[11px] text-muted-foreground">
            Varianten werden erst nach „Übernehmen“ im Store sichtbar. Die Generierung kann bis
            zu einer Minute dauern.
          </p>
        </div>
      </aside>
    </>
  );
}
