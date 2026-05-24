"use client";

import { useEffect, useState } from "react";
import {
  fetchOffersByPartner,
  type RoebelCardOfferRow,
  type OfferKind,
} from "@/lib/supabase-roebel-card-offers";
import { usePartner } from "../_components/PartnerContext";
import { ComingSoonCard } from "../_components/ComingSoonCard";
import { formatEuros } from "@/lib/format-euros";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<OfferKind, string> = {
  percent_discount: "Rabatt %",
  fixed_discount: "Rabatt €",
  free_item_at_threshold: "Gratis-Artikel",
  other: "Sonstige",
};

export default function PartnerOffersPage() {
  const partner = usePartner();
  const [offers, setOffers] = useState<RoebelCardOfferRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const rows = await fetchOffersByPartner(partner.id);
      if (!cancelled) {
        setOffers(rows);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [partner.id]);

  if (loading) {
    return <div className="h-48 bg-muted rounded-[10px] animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      {offers.length === 0 ? (
        <div className="bg-card border border-border rounded-[10px] p-8 text-center text-sm text-muted-foreground">
          Noch keine Angebote angelegt.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}

      <ComingSoonCard
        title="Angebote erstellen & bearbeiten — bald verfügbar"
        description="Du wirst hier Rabatte, Gratis-Artikel und zeitlich begrenzte Aktionen für Röbel Card Kunden anlegen können."
      />
    </div>
  );
}

function OfferCard({ offer }: { offer: RoebelCardOfferRow }) {
  const value =
    offer.kind === "percent_discount" && offer.value_bps !== null
      ? `${(offer.value_bps / 100).toFixed(0)} %`
      : offer.kind === "fixed_discount" && offer.value_bps !== null
      ? formatEuros(offer.value_bps)
      : offer.kind === "free_item_at_threshold"
      ? offer.free_item ?? "—"
      : "—";

  return (
    <div className="bg-card border border-border rounded-[10px] p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{offer.title}</p>
          <p className="text-xs text-muted-foreground">
            {KIND_LABELS[offer.kind]}
          </p>
        </div>
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            offer.is_active
              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {offer.is_active ? "Aktiv" : "Inaktiv"}
        </span>
      </div>
      {offer.description ? (
        <p className="text-sm text-muted-foreground">{offer.description}</p>
      ) : null}
      <p className="text-sm font-medium text-foreground tabular-nums">
        {value}
      </p>
    </div>
  );
}
