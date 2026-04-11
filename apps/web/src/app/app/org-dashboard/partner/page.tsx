"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useActiveAccount } from "thirdweb/react";
import { getBusinessesByOwner } from "@/app/actions/businesses";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/types/business";
import type { RoebelCardPartner, StampCard } from "@/types/roebel-card";
import {
  ArrowLeft,
  Handshake,
  CreditCard,
  Stamp,
  Users,
  TrendingUp,
  Plus,
  Settings,
  QrCode,
} from "lucide-react";

export default function PartnerDashboardPage() {
  const account = useActiveAccount();
  const [business, setBusiness] = useState<Business | null>(null);
  const [partner, setPartner] = useState<RoebelCardPartner | null>(null);
  const [stampCardCount, setStampCardCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!account?.address) return;
      setLoading(true);

      const bizResult = await getBusinessesByOwner(account.address);
      if (!bizResult.success || !bizResult.data || bizResult.data.length === 0) {
        setLoading(false);
        return;
      }

      const biz = bizResult.data[0];
      setBusiness(biz);

      const supabase = createClient();

      // Fetch partner status
      const { data: partnerData } = await supabase
        .from("roebel_stamp_partners")
        .select("*")
        .eq("business_id", biz.id)
        .limit(1);

      if (partnerData && partnerData.length > 0) {
        setPartner(partnerData[0] as RoebelCardPartner);

        // Count active stamp cards for this partner
        const { count } = await supabase
          .from("stamp_cards")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", partnerData[0].id)
          .eq("is_completed", false);

        setStampCardCount(count || 0);
      }

      setLoading(false);
    }
    fetch();
  }, [account?.address]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!business) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <Handshake className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Kein Gewerbe gefunden.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Link
        href="/app/org-dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zum Dashboard
      </Link>

      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        Röbel Card Partner
      </h1>

      {partner ? (
        <>
          {/* Partner stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <TrendingUp className="h-4 w-4 text-green-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{partner.total_redemptions}</p>
              <p className="text-xs text-muted-foreground">Einlösungen</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <Stamp className="h-4 w-4 text-amber-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{stampCardCount}</p>
              <p className="text-xs text-muted-foreground">Aktive Karten</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <Users className="h-4 w-4 text-blue-500 mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">—</p>
              <p className="text-xs text-muted-foreground">Kunden</p>
            </div>
          </div>

          {/* Offer configuration */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Angebotstyp</h2>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400">
                {partner.offer_type === "stamp_card" ? "Stempelkarte" :
                 partner.offer_type === "points_multiplier" ? "Punkte ×2" :
                 partner.offer_type === "exclusive_access" ? "Exklusiv" :
                 partner.offer_type === "priority_booking" ? "Priorität" :
                 "Individuell"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {partner.offer_type === "stamp_card"
                ? "Kunden sammeln Stempel bei jedem Besuch und erhalten eine Belohnung."
                : partner.offer_type === "points_multiplier"
                ? "Kunden erhalten doppelte Röbel Punkte bei Einkäufen in deinem Gewerbe."
                : "Exklusive Angebote für Röbel Card Inhaber."}
            </p>
          </div>

          {/* QR Code section */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <QrCode className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">QR-Code für Kunden</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Drucke diesen QR-Code aus und platziere ihn an der Kasse. Kunden scannen ihn mit der Röbel App, um Stempel zu sammeln.
            </p>
            <div className="flex items-center justify-center p-6 bg-muted rounded-lg">
              <div className="text-center">
                <QrCode className="h-16 w-16 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">QR-Code wird generiert...</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Not yet a partner — enrollment CTA */
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="text-center mb-6">
            <Handshake className="h-12 w-12 text-primary mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Werde Röbel Card Partner
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Kein Rabatt nötig — Kunden zahlen mit Röbel Punkten, du bekommst den vollen Betrag aus dem Community-Fonds. Biete Stempelkarten, Punkte-Multiplikatoren oder exklusive Zugänge an.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <OfferOption
              title="Stempelkarte"
              description="10. Kaffee gratis, 5 Besuche = Dessert"
              icon={<Stamp className="h-6 w-6 text-amber-500" />}
            />
            <OfferOption
              title="Punkte ×2"
              description="Doppelte Punkte bei Einkäufen"
              icon={<TrendingUp className="h-6 w-6 text-green-500" />}
            />
            <OfferOption
              title="Exklusiv"
              description="VIP-Events, Priority Booking"
              icon={<Users className="h-6 w-6 text-blue-500" />}
            />
          </div>

          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-medium text-foreground mb-2">Was kostet es?</h3>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Nichts.</strong> Kein Einrichtungsgebühr, keine monatlichen Kosten.
              Du bekommst zahlende Kunden, die mit Röbel Punkten bezahlen — der Community-Fonds erstattet den vollen Betrag.
            </p>
          </div>

          <button
            className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold transition-colors"
            onClick={() => {
              // TODO: Partner enrollment flow
              alert("Partner-Anmeldung kommt bald!");
            }}
          >
            Jetzt Partner werden
          </button>
        </div>
      )}
    </div>
  );
}

function OfferOption({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="p-4 border border-border rounded-lg text-center">
      <div className="flex justify-center mb-2">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}
