"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateRestaurantAiStyle } from "@/app/actions/restaurants";
import {
  AI_IMAGE_STYLE_LABELS,
  AI_IMAGE_STYLE_DESCRIPTIONS,
  type AiImageStyle,
} from "@/types/restaurant";

const PRESETS: AiImageStyle[] = [
  "dark_stoneware",
  "italian_gingham",
  "light_concrete",
  "wooden_board",
];

const PRESET_SWATCH: Record<AiImageStyle, string> = {
  dark_stoneware: "bg-neutral-800",
  italian_gingham:
    "bg-[repeating-conic-gradient(#e7d8b8_0deg_90deg,#fff_90deg_180deg)] bg-[length:14px_14px]",
  light_concrete: "bg-neutral-200",
  wooden_board:
    "bg-gradient-to-br from-amber-600 via-amber-500 to-amber-700",
};

interface AiStyleSelectorProps {
  restaurantId: string;
  initialStyle: AiImageStyle | null;
  onSaved?: (style: AiImageStyle | null) => void;
}

export function AiStyleSelector({
  restaurantId,
  initialStyle,
  onSaved,
}: AiStyleSelectorProps) {
  const [selected, setSelected] = useState<AiImageStyle | null>(initialStyle);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateRestaurantAiStyle(restaurantId, selected);
      if (res.success) {
        toast.success(res.message ?? "Gespeichert");
        onSaved?.(selected);
      } else {
        toast.error(res.error ?? "Speichern fehlgeschlagen");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">KI-Bildstil</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Wähle den Hintergrund, mit dem KI-generierte Gerichtsbilder für dein
          Restaurant gerendert werden. Wenn kein Stil gesetzt ist, wird ein neutraler
          Standardhintergrund verwendet.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PRESETS.map((preset) => {
          const isActive = selected === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => setSelected(preset)}
              className={`relative text-left rounded-[10px] border p-4 transition-colors ${
                isActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent"
              }`}
            >
              <div
                aria-hidden
                className={`h-16 w-full rounded-md mb-3 border border-border/60 ${PRESET_SWATCH[preset]}`}
              />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {AI_IMAGE_STYLE_LABELS[preset]}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">
                    {AI_IMAGE_STYLE_DESCRIPTIONS[preset]}
                  </p>
                </div>
                {isActive && (
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
          disabled={pending}
        >
          Stil zurücksetzen (Standard)
        </button>
        <Button onClick={handleSave} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Speichern
        </Button>
      </div>
    </div>
  );
}
