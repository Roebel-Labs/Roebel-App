"use client";

import { useEffect, useState } from "react";
import { Loader2, UtensilsCrossed } from "lucide-react";
import { useAccount } from "@/lib/context/AccountContext";
import { getOrCreateRestaurantForAccount } from "@/app/actions/restaurants";
import type { Restaurant } from "@/types/restaurant";
import { SpeisekarteShell } from "@/components/dashboard/speisekarte/speisekarte-shell";

export default function SpeisekartePage() {
  const { activeAccount } = useAccount();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeAccount) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrCreateRestaurantForAccount(activeAccount.id)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setRestaurant(res.data);
        } else {
          setError(res.error ?? "Fehler beim Laden des Restaurants");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeAccount]);

  if (activeAccount?.sub_type !== "restaurant") {
    return (
      <div className="max-w-2xl py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
          <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Speisekarte nur für Gastronomie</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dieser Bereich ist nur für Organisationskonten vom Typ „Restaurant“ verfügbar.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="max-w-2xl py-12 text-center">
        <h1 className="text-lg font-semibold text-foreground">Fehler</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {error ?? "Restaurant konnte nicht geladen werden."}
        </p>
      </div>
    );
  }

  return <SpeisekarteShell restaurant={restaurant} />;
}
