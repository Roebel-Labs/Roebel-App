"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface LightboxImage {
  url: string;
  label: string;
}

export function PosterLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: LightboxImage[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  const open = index !== null && index >= 0 && index < images.length;
  const current = open ? images[index as number] : null;
  const prev = () => open && onIndexChange(((index as number) - 1 + images.length) % images.length);
  const next = () => open && onIndexChange(((index as number) + 1) % images.length);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, images.length]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(96vw,900px)] p-2 sm:p-3">
        <DialogTitle className="sr-only">{current?.label ?? "Großansicht"}</DialogTitle>
        {current ? (
          <div className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.url}
              alt={current.label}
              className="mx-auto max-h-[85vh] w-auto max-w-full rounded-[6px] object-contain"
            />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <Button variant="ghost" size="sm" onClick={prev} disabled={images.length < 2} aria-label="Vorheriges Bild">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                {current.label}
                {images.length > 1 ? ` · ${(index as number) + 1} von ${images.length}` : ""}
              </span>
              <Button variant="ghost" size="sm" onClick={next} disabled={images.length < 2} aria-label="Nächstes Bild">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
