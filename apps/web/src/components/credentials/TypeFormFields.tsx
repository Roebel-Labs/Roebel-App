"use client";

import { useState } from "react";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";
import { KIND_LABELS, MAX_BENEFITS, type TypeForm } from "@/lib/credentials/type-form";

const input = "w-full rounded-md border border-[#B4B8C1] bg-background px-3 py-2 text-sm focus:border-[#00498B] focus:outline-none";

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-[#6B7280]">{hint}</span>}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

/** Uploads through the existing /api/upload-image route; returns the public URL. */
async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload-image", { method: "POST", body: fd });
  const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !json?.url) throw new Error("Das Bild konnte nicht hochgeladen werden.");
  return json.url;
}

/** Name, description, image, benefits, kind, limit and claim window of a credential type. */
export function TypeFormFields({
  form,
  onChange,
  errors,
  mode,
}: {
  form: TypeForm;
  onChange: (f: TypeForm) => void;
  errors: Record<string, string>;
  mode: "create" | "update";
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const set = <K extends keyof TypeForm>(k: K, v: TypeForm[K]) => onChange({ ...form, [k]: v });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      set("imageUrl", await uploadImage(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {form.template === "stadtvertreter" && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-[#6B7280]">
          Als offizielles Amt erkennt die Stadtgemeinschaft diesen Typ gesondert an.
        </p>
      )}
      <Field label="Name" error={errors.name}>
        <input className={input} value={form.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Beschreibung" error={errors.description} hint={`${form.description.length}/300`}>
        <textarea className={input} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Field label="Art" hint={mode === "update" ? "Die Art lässt sich nach dem Anlegen nicht mehr ändern." : undefined}>
        <select
          className={input}
          value={form.kind}
          disabled={mode === "update"}
          onChange={(e) => set("kind", e.target.value as TypeForm["kind"])}
        >
          {(Object.keys(KIND_LABELS) as TypeForm["kind"][]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>
      <div className="space-y-1">
        <span className="text-sm font-medium text-foreground">Bild</span>
        <div className="flex items-center gap-3">
          {form.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.imageUrl} alt="" className="h-16 w-16 rounded-md border border-[#B4B8C1] object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-[#B4B8C1] text-[#6B7280]">
              <ImagePlus className="h-5 w-5" aria-hidden />
            </div>
          )}
          <label className="cursor-pointer rounded-md border border-[#B4B8C1] px-3 py-1.5 text-sm hover:bg-muted">
            {uploading ? <Loader2 className="inline h-4 w-4 animate-spin" aria-hidden /> : "Bild wählen"}
            <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={uploading} />
          </label>
          {form.imageUrl && (
            <button type="button" className="text-sm text-[#6B7280] hover:underline" onClick={() => set("imageUrl", null)}>
              Entfernen
            </button>
          )}
        </div>
        {uploadError && <span className="block text-xs text-red-600">{uploadError}</span>}
      </div>
      <div className="space-y-1">
        <span className="text-sm font-medium text-foreground">Vorteile</span>
        {form.benefits.map((b, i) => (
          <div key={i} className="flex gap-2">
            <input
              className={input}
              value={b}
              maxLength={80}
              placeholder="z. B. Freier Eintritt beim Sommerfest"
              onChange={(e) => set("benefits", form.benefits.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              aria-label="Vorteil entfernen"
              className="rounded-md px-2 text-[#6B7280] hover:bg-muted"
              onClick={() => set("benefits", form.benefits.filter((_, j) => j !== i))}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {form.benefits.length < MAX_BENEFITS && (
          <button type="button" className="inline-flex items-center gap-1 text-sm text-[#00498B] hover:underline" onClick={() => set("benefits", [...form.benefits, ""])}>
            <Plus className="h-4 w-4" aria-hidden /> Vorteil hinzufügen
          </button>
        )}
        {errors.benefits && <span className="block text-xs text-red-600">{errors.benefits}</span>}
      </div>
      <Field label="Höchstzahl" error={errors.supplyCap} hint="Leer lassen für keine Begrenzung.">
        <input className={input} inputMode="numeric" value={form.supplyCap} onChange={(e) => set("supplyCap", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Abholbar ab" error={errors.claimStart}>
          <input type="datetime-local" className={input} value={form.claimStart} onChange={(e) => set("claimStart", e.target.value)} />
        </Field>
        <Field label="Abholbar bis" error={errors.claimEnd}>
          <input type="datetime-local" className={input} value={form.claimEnd} onChange={(e) => set("claimEnd", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}
