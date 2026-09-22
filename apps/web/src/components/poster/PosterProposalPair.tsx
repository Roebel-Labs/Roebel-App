"use client";

import { useState } from "react";
import { Download, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { downloadImage, slugForFile } from "@/lib/flyer/ui";
import type { PosterProposal } from "@/lib/poster/types";
import { AFrame } from "./AFrame";
import { PosterLightbox } from "./PosterLightbox";

export const DIRECTION_LABELS: Record<string, string> = {
  plakativ: "Plakativ",
  originaltreu: "Originaltreu",
  aufgefrischt: "Aufgefrischt",
  editorial: "Editorial",
  konzert: "Konzertplakat",
  verspielt: "Verspielt",
  ruhig: "Ruhig",
  amtlich: "Amtlich",
  appetitlich: "Appetitlich",
  galerie: "Galerie",
  festlich: "Festlich",
};

const VARIANT_LETTER = ["A", "B"];

export function PosterProposalPair({
  proposals,
  fileBase,
  selectedId,
  busy,
  onSelect,
  onKeepOriginal,
  onRegenerate,
  selectLabel = "Übernehmen",
}: {
  proposals: PosterProposal[];
  fileBase: string;
  selectedId?: string | null;
  busy?: boolean;
  onSelect: (p: PosterProposal) => void;
  onKeepOriginal?: () => void;
  onRegenerate?: (hint: string) => void;
  selectLabel?: string;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [hint, setHint] = useState("");
  const [showHint, setShowHint] = useState(false);
  const sorted = [...proposals].sort((a, b) => a.variant - b.variant);
  const images = sorted.map((p, i) => ({
    url: p.image_url,
    label: `Variante ${VARIANT_LETTER[i] ?? i + 1} · ${DIRECTION_LABELS[p.direction] ?? p.direction}`,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sorted.map((p, i) => {
          const label = images[i].label;
          const isSelected = selectedId === p.id || p.status === "selected";
          return (
            <div key={p.id} className="space-y-2">
              <AFrame
                src={p.image_url}
                alt={label}
                fit="cover"
                onClick={() => setLightbox(i)}
                className={isSelected ? "ring-2 ring-primary" : ""}
                badge={<Badge variant="secondary" className="text-[11px]">KI-generiert</Badge>}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{label}</span>
                {isSelected ? (
                  <span className="inline-flex items-center gap-1 text-xs text-primary">
                    <Check className="h-3.5 w-3.5" /> gewählt
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy || isSelected} onClick={() => onSelect(p)}>
                  {selectLabel}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadImage(p.image_url, `${slugForFile(fileBase)}-plakat-${VARIANT_LETTER[i] ?? i + 1}.jpg`)
                  }
                >
                  <Download className="mr-1 h-4 w-4" /> Herunterladen
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {onKeepOriginal || onRegenerate ? (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
            {onRegenerate ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setShowHint((s) => !s)}>
                <RefreshCw className="mr-1 h-4 w-4" /> Neu erzeugen
              </Button>
            ) : null}
            {onKeepOriginal ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={onKeepOriginal}>
                Original behalten
              </Button>
            ) : null}
          </div>
          {onRegenerate && showHint ? (
            <div className="space-y-2">
              <Textarea
                id="poster-regenerate-hint"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Optionaler Hinweis, z. B. „Logo größer, weniger Rot“"
                rows={2}
              />
              <Button size="sm" disabled={busy} onClick={() => onRegenerate(hint)}>
                Zwei neue Vorschläge erzeugen
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <PosterLightbox images={images} index={lightbox} onClose={() => setLightbox(null)} onIndexChange={setLightbox} />
    </div>
  );
}
