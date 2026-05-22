"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Loader2, Sparkles, Upload, Trash2, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  uploadMenuItemImage,
  clearMenuItemImage,
  regenerateMenuItemImageWithAi,
} from "@/app/actions/restaurants";

interface ItemImageFieldProps {
  itemId: string | null;
  imageUrl: string | null;
  onImageChange: (url: string | null) => void;
}

export function ItemImageField({
  itemId,
  imageUrl,
  onImageChange,
}: ItemImageFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [clearPending, startClearTransition] = useTransition();

  const itemReady = !!itemId;

  const handleFile = async (file: File) => {
    if (!itemId) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await uploadMenuItemImage(itemId, formData);
    setUploading(false);
    if (res.success && res.image_url) {
      onImageChange(res.image_url);
      toast.success(res.message ?? "Bild hochgeladen");
    } else {
      toast.error(res.error ?? "Upload fehlgeschlagen");
    }
  };

  const handleGenerate = async () => {
    if (!itemId) return;
    setGenerating(true);
    const res = await regenerateMenuItemImageWithAi(itemId);
    setGenerating(false);
    if (res.success && res.image_url) {
      onImageChange(res.image_url);
      toast.success(res.message ?? "Bild generiert");
    } else {
      toast.error(res.error ?? "KI-Bilderzeugung fehlgeschlagen");
    }
  };

  const handleClear = () => {
    if (!itemId) return;
    startClearTransition(async () => {
      const res = await clearMenuItemImage(itemId);
      if (res.success) {
        onImageChange(null);
        toast.success(res.message ?? "Bild entfernt");
      } else {
        toast.error(res.error ?? "Entfernen fehlgeschlagen");
      }
    });
  };

  return (
    <div className="space-y-2">
      <Label>Bild</Label>
      <div className="flex items-start gap-4">
        <div className="relative w-32 h-20 rounded-md overflow-hidden border border-border bg-muted flex-shrink-0">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt=""
              fill
              sizes="128px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <ImageOff className="h-5 w-5" />
            </div>
          )}
          {(generating || uploading) && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          {!itemReady && (
            <p className="text-xs text-muted-foreground">
              Speichere das Gericht zuerst, um ein Bild hochzuladen oder zu generieren.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!itemReady || uploading || generating}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Bild hochladen
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!itemReady || uploading || generating}
              onClick={handleGenerate}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              Mit KI generieren
            </Button>
            {imageUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!itemReady || clearPending || uploading || generating}
                onClick={handleClear}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Entfernen
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            KI-Bilderzeugung kann bis zu 50 Sekunden dauern.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
