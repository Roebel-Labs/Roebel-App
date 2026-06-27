"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface MenuCategoriesSheetProps {
  open: boolean;
  categories: { id: string; name: string }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export function MenuCategoriesSheet({
  open,
  categories,
  activeIndex,
  onSelect,
  onClose,
}: MenuCategoriesSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Kategorien</SheetTitle>
        </SheetHeader>
        <div className="mt-2 flex flex-col">
          {categories.map((cat, i) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                "rounded-md px-3 py-3 text-left text-base transition-colors hover:bg-accent",
                i === activeIndex
                  ? "font-medium text-primary"
                  : "text-foreground"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
