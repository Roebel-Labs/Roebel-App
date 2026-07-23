"use client";

// "In CMS übernehmen" — writes an uploaded chat image URL into an image field
// of the app's Mini-CMS content (mini_app_data, scope "app"). Offered on chat
// attachments once the app is published; targets are found heuristically
// (field names like bild/image/foto or values that already hold image URLs).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ImageDown, Loader2, X } from "lucide-react";
import {
  findImageFields,
  loadCmsItems,
  saveCmsValue,
  setAtPath,
  type ImageFieldTarget,
} from "../lib/cmsData";

export function CmsImagePicker({
  imageUrl,
  appSlug,
  wallet,
  onClose,
}: {
  imageUrl: string;
  appSlug: string;
  wallet: string;
  onClose: () => void;
}) {
  const [targets, setTargets] = useState<ImageFieldTarget[] | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCmsItems(appSlug).then((items) => {
      if (!cancelled) setTargets(items ? findImageFields(items) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [appSlug]);

  const apply = async (target: ImageFieldTarget) => {
    setBusyLabel(target.label);
    const items = await loadCmsItems(appSlug);
    const item = items?.find((i) => i.key === target.key);
    if (!item) {
      toast.error("Inhalt nicht mehr vorhanden — Panel neu laden.");
      setBusyLabel(null);
      return;
    }
    const next = setAtPath(item.value, target.path, imageUrl);
    const res = await saveCmsValue(appSlug, wallet, target.key, next);
    setBusyLabel(null);
    if (res.ok) {
      toast.success(`Bild in „${target.label}" übernommen.`);
      onClose();
    } else {
      toast.error(res.error ?? "Übernehmen fehlgeschlagen.");
    }
  };

  return (
    <div className="mt-1.5 rounded-[10px] border border-border bg-card p-2 text-left shadow-sm">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
          <ImageDown className="h-3 w-3" /> In CMS übernehmen
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {targets === null ? (
        <div className="flex items-center gap-1.5 px-1 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Inhalte werden geladen…
        </div>
      ) : targets.length === 0 ? (
        <p className="px-1 py-1 text-xs text-muted-foreground">
          Kein Bild-Feld im CMS gefunden. Lege im Tab „Inhalte“ ein Feld wie „bild“ an.
        </p>
      ) : (
        <div className="max-h-40 space-y-0.5 overflow-y-auto">
          {targets.map((t) => (
            <button
              key={`${t.key}:${t.path.join(".")}`}
              type="button"
              disabled={busyLabel !== null}
              onClick={() => void apply(t)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50"
            >
              <span className="min-w-0 truncate">{t.label}</span>
              {busyLabel === t.label ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : (
                <Check className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
