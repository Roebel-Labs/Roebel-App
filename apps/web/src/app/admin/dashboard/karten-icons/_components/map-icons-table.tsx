"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Trash2, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setMapMarkerIcon } from "@/app/actions/map-icons";
import {
  ENTITY_TYPE_LABELS,
  type MapMarkerEntity,
  type MapMarkerEntityType,
} from "@/lib/maps/marker-emoji";

const TYPE_ORDER: MapMarkerEntityType[] = ["restaurant", "business", "org", "event", "poi"];

/** Rendered pin size: 288 px with a white ring, transparent corners — the
 *  Expo map registers it at scale 3 (apps/expo/lib/map/markers.ts). */
const MARKER_PX = 288;
const MARKER_RING_PX = 14;
const MARKER_BUCKET = "images";
const MARKER_FOLDER = "map-markers";

async function toCircularMarkerPng(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = MARKER_PX;
  canvas.height = MARKER_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  const c = MARKER_PX / 2;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c - MARKER_RING_PX, 0, Math.PI * 2);
  ctx.clip();
  const inner = MARKER_PX - MARKER_RING_PX * 2;
  const scale = Math.max(inner / bitmap.width, inner / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (MARKER_PX - w) / 2, (MARKER_PX - h) / 2, w, h);
  ctx.restore();
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

type Props = { entities: MapMarkerEntity[] };

export function MapIconsTable({ entities }: Props) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MapMarkerEntityType | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entities
      .filter((e) => typeFilter === "all" || e.entityType === typeFilter)
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          TYPE_ORDER.indexOf(a.entityType) - TYPE_ORDER.indexOf(b.entityType) ||
          a.name.localeCompare(b.name, "de"),
      );
  }, [entities, query, typeFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entities.length };
    for (const e of entities) c[e.entityType] = (c[e.entityType] ?? 0) + 1;
    return c;
  }, [entities]);

  const customCount = entities.filter((e) => e.imageUrl).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suchen…"
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-1">
          {(["all", ...TYPE_ORDER] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={typeFilter === t ? "default" : "outline"}
              onClick={() => setTypeFilter(t)}
            >
              {t === "all" ? "Alle" : ENTITY_TYPE_LABELS[t]}
              <span className="ml-1 text-xs opacity-70">{counts[t] ?? 0}</span>
            </Button>
          ))}
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {customCount} mit eigenem Bild
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Pin</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Typ</th>
              <th className="px-3 py-2">Standard</th>
              <th className="px-3 py-2">Emoji</th>
              <th className="px-3 py-2">Eigenes Bild</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <MapIconRow key={`${e.entityType}-${e.entityId}`} entity={e} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Nichts gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MapIconRow({ entity }: { entity: MapMarkerEntity }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [emojiDraft, setEmojiDraft] = useState(entity.emoji ?? "");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shownEmoji = entity.emoji || entity.defaultEmoji;

  const save = (patch: { emoji?: string | null; imageUrl?: string | null }) => {
    startTransition(async () => {
      const result = await setMapMarkerIcon({
        entityType: entity.entityType,
        entityId: entity.entityId,
        ...patch,
      });
      if (result.success) {
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const commitEmoji = () => {
    const next = emojiDraft.trim();
    if (next === (entity.emoji ?? "")) return;
    save({ emoji: next || null });
  };

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte eine Bilddatei wählen");
      return;
    }
    setUploading(true);
    try {
      const blob = await toCircularMarkerPng(file);
      const path = `${MARKER_FOLDER}/${entity.entityType}-${entity.entityId}-${Date.now()}.png`;
      const supabase = createClient();
      // 1y cacheControl doubles as the "already processed" marker for the
      // weekly reencode cron (see supabase-storage-hygiene).
      const { error } = await supabase.storage
        .from(MARKER_BUCKET)
        .upload(path, blob, { cacheControl: "31536000", contentType: "image/png", upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(MARKER_BUCKET).getPublicUrl(path);
      save({ imageUrl: data.publicUrl });
    } catch (error) {
      console.error("marker upload failed", error);
      toast.error("Bild konnte nicht hochgeladen werden");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const busy = pending || uploading;

  return (
    <tr className="border-t">
      <td className="px-3 py-2">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border bg-background text-xl">
          {entity.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entity.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-label="Emoji-Pin">{shownEmoji}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 font-medium">{entity.name}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {ENTITY_TYPE_LABELS[entity.entityType]}
        {entity.category ? <span className="ml-1 text-xs">· {entity.category}</span> : null}
      </td>
      <td className="px-3 py-2 text-xl">{entity.defaultEmoji}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <Input
            value={emojiDraft}
            onChange={(e) => setEmojiDraft(e.target.value)}
            onBlur={commitEmoji}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder={entity.defaultEmoji}
            maxLength={16}
            disabled={busy}
            className="w-20 text-center text-lg"
            aria-label={`Emoji für ${entity.name}`}
          />
          {entity.emoji && (
            <Button
              size="icon"
              variant="ghost"
              title="Zurück zum Standard"
              disabled={busy}
              onClick={() => {
                setEmojiDraft("");
                save({ emoji: null });
              }}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadImage(file);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="mr-1 h-4 w-4" />
            {entity.imageUrl ? "Ersetzen" : "Hochladen"}
          </Button>
          {entity.imageUrl && (
            <Button
              size="sm"
              variant="ghost"
              title="Bild entfernen, zurück zum Emoji"
              disabled={busy}
              onClick={() => save({ imageUrl: null })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          {entity.sourceImageUrl && !entity.imageUrl && (
            <a
              href={entity.sourceImageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline"
              title="Vorhandenes Logo/Bild dieses Eintrags öffnen"
            >
              Logo
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}
