"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BedDouble,
  Megaphone,
  ShoppingBasket,
  ShoppingCart,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";

type CategoryId =
  | "hotels"
  | "restaurants"
  | "dienstleistungen"
  | "einkaufen"
  | "lebensmittel"
  | "werbung";

interface Category {
  id: CategoryId;
  label: string;
  icon: React.ReactNode;
  example: { merchant: string; description: string; amount: string };
  /** Tailwind gradient classes for the placeholder background. */
  gradient: string;
  /** Tailwind for the foreground accent panel. */
  accent: string;
}

const CATEGORIES: Category[] = [
  {
    id: "hotels",
    label: "Hotels",
    icon: <BedDouble className="h-4 w-4" strokeWidth={1.8} />,
    example: { merchant: "Hotel am Hafen", description: "Buchung", amount: "148,50 €" },
    gradient: "from-[#1e3a6e] via-[#2d5599] to-[#5b8ed1]",
    accent: "bg-[#1e3a6e]",
  },
  {
    id: "restaurants",
    label: "Restaurants",
    icon: <UtensilsCrossed className="h-4 w-4" strokeWidth={1.8} />,
    example: { merchant: "Müritzblick", description: "Mittagstisch", amount: "12,90 €" },
    gradient: "from-[#5d3a1a] via-[#a06530] to-[#d8a05a]",
    accent: "bg-[#5d3a1a]",
  },
  {
    id: "dienstleistungen",
    label: "Dienstleistungen",
    icon: <Wrench className="h-4 w-4" strokeWidth={1.8} />,
    example: { merchant: "Friseur Salon Röbel", description: "Schnitt + Färben", amount: "62,00 €" },
    gradient: "from-[#1f4d4d] via-[#2f7373] to-[#7bbcbc]",
    accent: "bg-[#1f4d4d]",
  },
  {
    id: "einkaufen",
    label: "Einkaufen",
    icon: <ShoppingCart className="h-4 w-4" strokeWidth={1.8} />,
    example: { merchant: "Buchhandlung Röbel", description: "Roman + Karte", amount: "28,90 €" },
    gradient: "from-[#5e2a55] via-[#8b3f7c] to-[#c47ab5]",
    accent: "bg-[#5e2a55]",
  },
  {
    id: "lebensmittel",
    label: "Lebensmittel",
    icon: <ShoppingBasket className="h-4 w-4" strokeWidth={1.8} />,
    example: { merchant: "Bäckerei am Markt", description: "Wocheneinkauf", amount: "34,75 €" },
    gradient: "from-[#3a5a1a] via-[#5e8a30] to-[#9bc466]",
    accent: "bg-[#3a5a1a]",
  },
  {
    id: "werbung",
    label: "Digitale Werbung",
    icon: <Megaphone className="h-4 w-4" strokeWidth={1.8} />,
    example: { merchant: "Röbel App Promo", description: "Anzeige · 7 Tage", amount: "49,00 €" },
    gradient: "from-[#1c1c2e] via-[#2e2e52] to-[#5b5b96]",
    accent: "bg-[#1c1c2e]",
  },
];

export function Section8Moments() {
  const [activeId, setActiveId] = useState<CategoryId>("hotels");
  const prefersReducedMotion = useReducedMotion();
  const active = CATEGORIES.find((c) => c.id === activeId) ?? CATEGORIES[0];

  return (
    <section className="bg-background py-20 sm:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-10 max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            Röbel Card für alltägliche Momente.
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Erleben Sie den Komfort, lokal zu bezahlen — vom Hotelaufenthalt bis
            zum Frühstück um die Ecke. Tippen Sie auf eine Kategorie.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-border shadow-sm">
          {/* Animated background */}
          <div className="relative aspect-[16/10] w-full sm:aspect-[16/8]">
            <AnimatePresence mode="sync">
              <motion.div
                key={active.id}
                className={cn(
                  "absolute inset-0 bg-gradient-to-br",
                  active.gradient,
                )}
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              >
                <div className="absolute inset-0 bg-black/15 backdrop-blur-sm" />
              </motion.div>
            </AnimatePresence>

            {/* Foreground card with payment example */}
            <div className="absolute inset-0 flex items-end justify-center p-5 sm:p-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active.id}
                  initial={
                    prefersReducedMotion
                      ? false
                      : { opacity: 0, y: 16, scale: 0.98 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -8, scale: 0.98 }
                  }
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="flex w-full max-w-md items-center gap-4 rounded-2xl bg-card/95 p-4 shadow-xl backdrop-blur-md sm:gap-5 sm:p-5"
                >
                  <div
                    className={cn(
                      "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-white sm:h-14 sm:w-14",
                      active.accent,
                    )}
                  >
                    {active.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground sm:text-base">
                      {active.example.merchant}
                    </p>
                    <p className="truncate text-xs text-muted-foreground sm:text-sm">
                      {active.example.description}
                    </p>
                  </div>
                  <p className="font-mono text-base font-semibold tracking-tight text-foreground sm:text-lg">
                    {active.example.amount}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Category chips */}
          <div className="scrollbar-hide flex gap-2 overflow-x-auto border-t border-border bg-card/95 p-4 sm:gap-3 sm:p-5">
            {CATEGORIES.map((cat) => {
              const isActive = cat.id === activeId;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveId(cat.id)}
                  className={cn(
                    "inline-flex flex-shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition-all sm:text-sm",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                  aria-pressed={isActive}
                >
                  {cat.icon}
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
