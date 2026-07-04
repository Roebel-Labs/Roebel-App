"use client";

// Manage a mini-app's square (1:1) preview images from the dashboard: upload files
// (→ Supabase Storage via /api/upload-image) or paste https URLs, shown as 1:1
// thumbnails you can remove. Stores a string[] of image URLs.
import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const MAX_PREVIEW_IMAGES = 6;

export function ScreenshotManager({
  value,
  onChange,
  max = MAX_PREVIEW_IMAGES,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const remaining = max - value.length;
  const canAdd = remaining > 0;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setUploading(true);
    try {
      const picked = Array.from(files).slice(0, remaining);
      const uploaded: string[] = [];
      for (const file of picked) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload-image", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.url) {
          throw new Error(data?.error ?? "Upload fehlgeschlagen");
        }
        uploaded.push(data.url as string);
      }
      onChange([...value, ...uploaded]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function addUrl() {
    const u = url.trim();
    if (!u) return;
    if (!/^https:\/\//i.test(u)) {
      setErr("Nur https-URLs erlaubt.");
      return;
    }
    if (!canAdd) return;
    onChange([...value, u]);
    setUrl("");
    setErr(null);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {value.map((src, i) => (
            <div key={`${src}-${i}`} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                className="aspect-square h-20 w-20 rounded-[10px] border border-border bg-muted object-cover"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Bild entfernen"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAdd || uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="mr-1.5 h-3.5 w-3.5" />
          )}
          {uploading ? "Lädt hoch…" : "Bild hochladen"}
        </Button>
        <div className="flex items-center gap-1.5">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrl();
              }
            }}
            placeholder="oder https://…-URL"
            disabled={!canAdd}
            className="h-8 w-52 text-xs"
          />
          <Button type="button" variant="ghost" size="sm" disabled={!canAdd} onClick={addUrl}>
            Hinzufügen
          </Button>
        </div>
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        Quadratische Vorschaubilder (1:1), max. {max}. {value.length}/{max}
      </p>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
