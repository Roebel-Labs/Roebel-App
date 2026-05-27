"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronDown,
  ChevronRight,
  ImagePlus,
  ImageOff,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clearItemImage,
  commitItemImage,
  regenerateItemImageWithAi,
  uploadItemImage,
  uploadReferenceImage,
  type ItemKind,
} from "@/app/actions/restaurants";
import {
  AI_IMAGE_STYLE_LABELS,
  type AiImageStyle,
} from "@/types/restaurant";

const PRESETS: AiImageStyle[] = [
  "dark_stoneware",
  "italian_gingham",
  "light_concrete",
  "wooden_board",
];
const DEFAULT_PRESET_VALUE = "__default__";

const VARIANTS_LIMIT = 4;
const variantsStorageKey = (kind: ItemKind, itemId: string) =>
  `roebel:ai-variants:${kind}:${itemId}`;

const REFERENCES_LIMIT = 4;
const referencesStorageKey = (kind: ItemKind, itemId: string) =>
  `roebel:ai-refs:${kind}:${itemId}`;

interface AiImageEditorProps {
  kind: ItemKind;
  itemId: string | null;
  imageUrl: string | null;
  restaurantStyle: AiImageStyle | null;
  onImageChange: (url: string | null) => void;
}

export function AiImageEditor({
  kind,
  itemId,
  imageUrl,
  restaurantStyle,
  onImageChange,
}: AiImageEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [promptHint, setPromptHint] = useState("");
  const [presetOverride, setPresetOverride] = useState<string>(DEFAULT_PRESET_VALUE);
  const [variants, setVariants] = useState<string[]>([]);
  const [references, setReferences] = useState<string[]>([]);

  const itemReady = !!itemId;
  const busy = uploading || generating || clearing || committing || uploadingReference;

  useEffect(() => {
    if (!itemId) {
      setVariants([]);
      setReferences([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(variantsStorageKey(kind, itemId));
      if (raw) setVariants(JSON.parse(raw) as string[]);
      else setVariants([]);
    } catch {
      setVariants([]);
    }
    try {
      const rawRefs = window.localStorage.getItem(referencesStorageKey(kind, itemId));
      if (rawRefs) setReferences(JSON.parse(rawRefs) as string[]);
      else setReferences([]);
    } catch {
      setReferences([]);
    }
  }, [kind, itemId]);

  const persistVariants = (next: string[]) => {
    setVariants(next);
    if (!itemId) return;
    try {
      window.localStorage.setItem(
        variantsStorageKey(kind, itemId),
        JSON.stringify(next),
      );
    } catch {
      // localStorage may be unavailable (private window) — silent fail.
    }
  };

  const persistReferences = (next: string[]) => {
    setReferences(next);
    if (!itemId) return;
    try {
      window.localStorage.setItem(
        referencesStorageKey(kind, itemId),
        JSON.stringify(next),
      );
    } catch {
      // localStorage may be unavailable (private window) — silent fail.
    }
  };

  const handleUpload = async (file: File) => {
    if (!itemId) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await uploadItemImage(kind, itemId, formData);
    setUploading(false);
    if (res.success && res.image_url) {
      onImageChange(res.image_url);
      toast.success(res.message ?? "Bild hochgeladen");
    } else {
      toast.error(res.error ?? "Upload fehlgeschlagen");
    }
  };

  const handleClear = async () => {
    if (!itemId) return;
    setClearing(true);
    const res = await clearItemImage(kind, itemId);
    setClearing(false);
    if (res.success) {
      onImageChange(null);
      toast.success(res.message ?? "Bild entfernt");
    } else {
      toast.error(res.error ?? "Entfernen fehlgeschlagen");
    }
  };

  const handleUploadReference = async (file: File) => {
    if (!itemId) return;
    setUploadingReference(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await uploadReferenceImage(kind, itemId, formData);
    setUploadingReference(false);
    if (res.success && res.url) {
      const next = [res.url, ...references.filter((r) => r !== res.url)].slice(
        0,
        REFERENCES_LIMIT,
      );
      persistReferences(next);
      toast.success(res.message ?? "Referenzbild hochgeladen");
    } else {
      toast.error(res.error ?? "Upload fehlgeschlagen");
    }
  };

  const handleRemoveReference = (url: string) => {
    persistReferences(references.filter((r) => r !== url));
  };

  const handleGenerateVariant = async () => {
    if (!itemId) return;
    setGenerating(true);
    const presetForCall =
      presetOverride === DEFAULT_PRESET_VALUE
        ? undefined
        : (presetOverride as AiImageStyle);
    const res = await regenerateItemImageWithAi(kind, itemId, {
      prompt_hint: promptHint.trim() || undefined,
      style_preset: presetForCall,
      preview: true,
      reference_image_urls: references.length ? references : undefined,
    });
    setGenerating(false);
    if (res.success && res.image_url) {
      const next = [res.image_url, ...variants.filter((v) => v !== res.image_url)].slice(
        0,
        VARIANTS_LIMIT,
      );
      persistVariants(next);
      toast.success("Variante erstellt — Klicke zum Übernehmen.");
    } else {
      toast.error(res.error ?? "KI-Bilderzeugung fehlgeschlagen");
    }
  };

  const handleCommitVariant = async (url: string) => {
    if (!itemId) return;
    setCommitting(true);
    const res = await commitItemImage(kind, itemId, url);
    setCommitting(false);
    if (res.success && res.image_url) {
      onImageChange(res.image_url);
      toast.success(res.message ?? "Bild übernommen");
    } else {
      toast.error(res.error ?? "Übernehmen fehlgeschlagen");
    }
  };

  const handleDiscardVariant = (url: string) => {
    persistVariants(variants.filter((v) => v !== url));
  };

  const defaultPresetLabel = restaurantStyle
    ? `Restaurant-Vorgabe (${AI_IMAGE_STYLE_LABELS[restaurantStyle]})`
    : "Restaurant-Vorgabe (Standard)";

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Bild</Label>

      <div className="relative w-full aspect-[16/9] rounded-md overflow-hidden border border-border bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 540px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageOff className="h-6 w-6" />
            <span className="text-xs">Noch kein Bild</span>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-foreground" />
          </div>
        )}
      </div>

      {!itemReady && (
        <p className="text-xs text-muted-foreground">
          Speichere das Gericht zuerst, um Bilder hochzuladen oder zu generieren.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!itemReady || busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Hochladen
        </Button>
        {imageUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!itemReady || busy}
            onClick={handleClear}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Entfernen
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
      </div>

      <div className="rounded-md border border-border">
        <button
          type="button"
          onClick={() => setEditorOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          {editorOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>KI-Editor</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {variants.length > 0 ? `${variants.length} Varianten` : "Prompt + Stil"}
          </span>
        </button>

        {editorOpen && (
          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border">
            <div className="space-y-1.5">
              <Label htmlFor="aiPromptHint" className="text-xs">
                Prompt-Hinweis (optional)
              </Label>
              <Textarea
                id="aiPromptHint"
                value={promptHint}
                onChange={(e) => setPromptHint(e.target.value)}
                placeholder="z. B. mit Pommes als Beilage, knusprig gebraten, frische Kräuter on top"
                rows={2}
                disabled={busy}
              />
              <p className="text-[11px] text-muted-foreground">
                Wird an die Standardbeschreibung angehängt.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="aiStylePreset" className="text-xs">
                Bildstil
              </Label>
              <Select
                value={presetOverride}
                onValueChange={setPresetOverride}
                disabled={busy}
              >
                <SelectTrigger id="aiStylePreset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_PRESET_VALUE}>
                    {defaultPresetLabel}
                  </SelectItem>
                  {PRESETS.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {AI_IMAGE_STYLE_LABELS[preset]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Referenzbilder (optional)</Label>
              <p className="text-[11px] text-muted-foreground">
                Lade ein echtes Foto dieses Gerichts hoch — die KI verwandelt es
                in den Marken-Look (max. {REFERENCES_LIMIT}).
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {references.map((url) => (
                  <div key={url} className="relative group">
                    <div className="relative h-14 w-14 rounded-md overflow-hidden border border-border">
                      <Image
                        src={url}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveReference(url)}
                      disabled={busy}
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      aria-label="Referenzbild entfernen"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {references.length < REFERENCES_LIMIT && (
                  <button
                    type="button"
                    disabled={!itemReady || busy}
                    onClick={() => referenceInputRef.current?.click()}
                    className="h-14 w-14 rounded-md border border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors disabled:opacity-50"
                    aria-label="Referenzbild hinzufügen"
                  >
                    {uploadingReference ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
              <input
                ref={referenceInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadReference(file);
                  e.target.value = "";
                }}
              />
            </div>

            <Button
              type="button"
              size="sm"
              disabled={!itemReady || busy}
              onClick={handleGenerateVariant}
              className="w-full"
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              {references.length > 0 ? "Variante aus Foto generieren" : "Variante generieren"}
            </Button>

            {variants.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Varianten — klicke zum Übernehmen</Label>
                <div className="grid grid-cols-4 gap-2">
                  {variants.map((url) => {
                    const isActive = url === imageUrl;
                    return (
                      <div key={url} className="relative group">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleCommitVariant(url)}
                          className={`relative w-full aspect-[16/9] rounded-md overflow-hidden border transition-colors ${
                            isActive
                              ? "border-primary ring-2 ring-primary"
                              : "border-border hover:border-foreground"
                          }`}
                        >
                          <Image
                            src={url}
                            alt=""
                            fill
                            sizes="80px"
                            className="object-cover"
                            unoptimized
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDiscardVariant(url)}
                          disabled={busy}
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          aria-label="Variante verwerfen"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  KI-Bilderzeugung kann bis zu 50 Sekunden dauern.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
