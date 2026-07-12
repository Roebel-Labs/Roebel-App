"use client";

// "Bilder" section on the builder app-detail page: 1:1 app icon + 16:9 store
// hero + up to five 1:1 store previews. Upload/Entfernen inline; ALL AI work
// (Seedream generation, edit of the current image, screenshot references)
// happens in the KI-Studio sidebar — one per target, variants commit
// explicitly (Speisekarte AiImageEditor pattern).
import { useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailCard } from "@/components/mini-apps/ui";
import { ImageStudio, type StudioKind } from "@/components/mini-apps/ImageStudio";
import type { MiniAppRow } from "@/lib/miniapp/types";

const MAX_PREVIEWS = 5;

type Target = { kind: StudioKind; slot?: number };

// wallet=null → admin session cookie authenticates server-side instead.
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

export function ImagesSection({
  app,
  wallet,
  onChanged,
}: {
  app: MiniAppRow;
  wallet: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [studio, setStudio] = useState<Target | null>(null);
  const fileTarget = useRef<Target | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function pickFile(target: Target) {
    fileTarget.current = target;
    fileInput.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const target = fileTarget.current;
    if (!file || !target) return;
    setError(null);
    setBusy(target);
    try {
      const form = new FormData();
      form.set("appId", app.id);
      form.set("kind", target.kind);
      if (target.slot !== undefined) form.set("slot", String(target.slot));
      form.set("file", file);
      await apiJson(`/api/mini-apps/images/upload`, wallet, { method: "POST", body: form });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind: StudioKind, slot?: number) {
    if (busy) return;
    setError(null);
    try {
      const params = new URLSearchParams({ appId: app.id, kind });
      if (slot !== undefined) params.set("slot", String(slot));
      await apiJson(`/api/mini-apps/images?${params}`, wallet, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const previews = app.screenshots ?? [];
  const isBusy = (kind: StudioKind, slot?: number) =>
    busy?.kind === kind && busy?.slot === slot;

  return (
    <DetailCard title="Bilder">
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={onFile}
      />

      {error && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {/* App-Icon */}
      <p className="text-sm font-semibold">App-Icon</p>
      <div className="mt-2 flex items-start gap-4">
        <div className="relative aspect-square w-28 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
          {isBusy("icon") ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : app.icon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={app.icon_url} alt={`Icon von ${app.name}`} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" onClick={() => setStudio({ kind: "icon" })} disabled={!!busy}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> KI-Studio
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => pickFile({ kind: "icon" })}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Hochladen
          </Button>
          {app.icon_url ? (
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => remove("icon")}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Entfernen
            </Button>
          ) : null}
        </div>
      </div>

      {/* Hero-Artwork für die Store-Karussell-Karte (16:9) */}
      <p className="mt-6 text-sm font-semibold">Store-Artwork (Hero-Karte)</p>
      <p className="text-xs text-muted-foreground">
        Breites 16:9-Bild für das Karussell im Mini-App-Store — bis es gesetzt
        ist, zeigt die Hero-Karte einen grauen Platzhalter.
      </p>
      <div className="mt-2 flex items-start gap-4">
        <div className="relative aspect-video w-full max-w-sm shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
          {isBusy("feature") ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : app.feature_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={app.feature_image_url}
              alt={`Store-Artwork von ${app.name}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" onClick={() => setStudio({ kind: "feature" })} disabled={!!busy}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> KI-Studio
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => pickFile({ kind: "feature" })}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Hochladen
          </Button>
          {app.feature_image_url ? (
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => remove("feature")}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Entfernen
            </Button>
          ) : null}
        </div>
      </div>

      {/* Store-Vorschau */}
      <p className="mt-6 text-sm font-semibold">Store-Vorschau (1:1)</p>
      <p className="text-xs text-muted-foreground">
        Bis zu {MAX_PREVIEWS} Bilder — hochladen oder im KI-Studio generieren
        (dort auch aus Editor-Screenshots, mit kurzer Bildunterschrift).
      </p>
      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
        {Array.from({ length: MAX_PREVIEWS }).map((_, slot) => {
          const url = previews[slot];
          return (
            <div
              key={slot}
              className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
            >
              {isBusy("preview", slot) ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Vorschau ${slot + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Vorschau ${slot + 1} im KI-Studio bearbeiten`}
                    title="KI-Studio"
                    onClick={() => setStudio({ kind: "preview", slot })}
                    className="absolute left-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/80 focus:opacity-100 [div:hover>&]:opacity-100"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Vorschau ${slot + 1} entfernen`}
                    onClick={() => remove("preview", slot)}
                    className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/80 focus:opacity-100 [div:hover>&]:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 p-1">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => setStudio({ kind: "preview", slot })}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <Sparkles className="h-3 w-3" /> KI-Studio
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => pickFile({ kind: "preview", slot })}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <Upload className="h-3 w-3" /> Hochladen
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {studio ? (
        <ImageStudio
          app={app}
          wallet={wallet}
          kind={studio.kind}
          slot={studio.slot}
          onClose={() => setStudio(null)}
          onChanged={onChanged}
        />
      ) : null}
    </DetailCard>
  );
}
