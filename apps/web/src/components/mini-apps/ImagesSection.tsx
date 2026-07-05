"use client";

// "Bilder" section on the builder app-detail page: 1:1 app icon + up to five
// 1:1 store previews. Each slot can be filled by upload, Nano Banana 2
// generation, or NB2 with an editor screenshot as reference ("Aus Screenshot").
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailCard } from "@/components/mini-apps/ui";
import type { MiniAppRow } from "@/lib/miniapp/types";

const MAX_PREVIEWS = 5;
const POLL_MS = 2500;
const POLL_BUDGET_MS = 120_000;

type Busy = { kind: "icon" | "preview"; slot?: number; label: string } | null;

async function apiJson(
  url: string,
  wallet: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "x-wallet-address": wallet,
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
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [wish, setWish] = useState("");
  const [shots, setShots] = useState<string[]>([]);
  const [shotPickerSlot, setShotPickerSlot] = useState<number | null>(null);
  const fileTarget = useRef<{ kind: "icon" | "preview"; slot?: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const loadShots = useCallback(() => {
    if (!wallet) return;
    apiJson(`/api/mini-apps/images/upload?appId=${app.id}`, wallet)
      .then((j) => {
        if (!cancelled.current && Array.isArray(j.shots)) setShots(j.shots as string[]);
      })
      .catch(() => {});
  }, [app.id, wallet]);

  useEffect(loadShots, [loadShots]);

  async function generate(kind: "icon" | "preview", slot?: number, referenceUrl?: string) {
    if (!wallet || busy) return;
    setError(null);
    setBusy({ kind, slot, label: "Wird generiert …" });
    try {
      const { taskId } = (await apiJson(`/api/mini-apps/images`, wallet, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appId: app.id,
          kind,
          slot,
          prompt: wish || undefined,
          referenceUrl,
        }),
      })) as { taskId: string };

      const deadline = Date.now() + POLL_BUDGET_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (cancelled.current) return;
        const params = new URLSearchParams({ taskId, appId: app.id, kind });
        if (slot !== undefined) params.set("slot", String(slot));
        const st = await apiJson(`/api/mini-apps/images/status?${params}`, wallet);
        if (st.status === "done") {
          onChanged();
          return;
        }
        if (st.status === "error") {
          throw new Error(typeof st.error === "string" ? st.error : "Generierung fehlgeschlagen.");
        }
      }
      throw new Error("Zeitüberschreitung — bitte versuche es erneut.");
    } catch (e) {
      if (!cancelled.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelled.current) setBusy(null);
    }
  }

  function pickFile(kind: "icon" | "preview", slot?: number) {
    fileTarget.current = { kind, slot };
    fileInput.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const target = fileTarget.current;
    if (!file || !target || !wallet) return;
    setError(null);
    setBusy({ ...target, label: "Wird hochgeladen …" });
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

  async function remove(kind: "icon" | "preview", slot?: number) {
    if (!wallet || busy) return;
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
  const isBusy = (kind: "icon" | "preview", slot?: number) =>
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

      <label className="mb-4 block">
        <span className="text-xs font-medium text-muted-foreground">
          Optionaler Wunsch für die KI (Stil, Motiv, Stimmung)
        </span>
        <input
          type="text"
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          placeholder="z. B. verspielt, mit Leuchtturm-Motiv"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </label>

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
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => pickFile("icon")}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Hochladen
          </Button>
          <Button size="sm" disabled={!!busy} onClick={() => generate("icon")}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Mit KI generieren
          </Button>
          {app.icon_url ? (
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => remove("icon")}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Entfernen
            </Button>
          ) : null}
        </div>
      </div>

      {/* Store-Vorschau */}
      <p className="mt-6 text-sm font-semibold">Store-Vorschau (1:1)</p>
      <p className="text-xs text-muted-foreground">
        Bis zu {MAX_PREVIEWS} Bilder — hochladen, generieren oder aus einem
        Editor-Screenshot bauen lassen.
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
                    onClick={() => pickFile("preview", slot)}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <Upload className="h-3 w-3" /> Hochladen
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => generate("preview", slot)}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <Sparkles className="h-3 w-3" /> KI
                  </button>
                  {shots.length > 0 && (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => setShotPickerSlot(slot)}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <Camera className="h-3 w-3" /> Aus Screenshot
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Screenshot-Auswahl für "Aus Screenshot" */}
      {shotPickerSlot !== null && (
        <div className="mt-4 rounded-xl border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold">
              Screenshot als Vorlage wählen (Slot {shotPickerSlot + 1})
            </p>
            <Button size="sm" variant="ghost" onClick={() => setShotPickerSlot(null)}>
              Abbrechen
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {shots.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  const slot = shotPickerSlot;
                  setShotPickerSlot(null);
                  if (slot !== null) generate("preview", slot, s);
                }}
                className="aspect-square overflow-hidden rounded-lg border border-border hover:ring-2 hover:ring-[#00498B]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s} alt="Editor-Screenshot" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Screenshots entstehen im KI-Baukasten über den Screenshot-Knopf.
          </p>
        </div>
      )}
    </DetailCard>
  );
}
