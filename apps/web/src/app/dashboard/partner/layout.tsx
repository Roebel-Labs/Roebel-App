"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CreditCard, ShieldAlert } from "lucide-react";
import { useAccount } from "@/lib/context/AccountContext";
import {
  isOrgAccount,
  subTypeFeatures,
  SUB_TYPE_LABELS,
} from "@/types/account";
import {
  fetchPartnerByAccountId,
  type RoebelCardPartnerRow,
} from "@/lib/supabase-roebel-card-partners";
import { PartnerProvider } from "./_components/PartnerContext";
import { PartnerTabNav } from "./_components/PartnerTabNav";
import { PartnerRegistrationForm } from "./_components/PartnerRegistrationForm";
import { StatusBanner } from "./_components/StatusBanner";

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { activeAccount } = useAccount();
  const [partner, setPartner] = useState<RoebelCardPartnerRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!activeAccount || !isOrgAccount(activeAccount)) {
        setPartner(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const row = await fetchPartnerByAccountId(activeAccount.id);
      if (!cancelled) {
        setPartner(row);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeAccount?.id]);

  if (!activeAccount || !isOrgAccount(activeAccount)) {
    return null;
  }

  const features = subTypeFeatures(activeAccount.sub_type);
  // Approved partners of any sub_type can always access the dashboard, even
  // if their sub_type isn't in the partner-eligible list (e.g. a Verein that
  // was admin-approved). Sub-type only controls whether registration CTA is
  // shown to unregistered orgs.
  const canAccess = features.partner || partner !== null;

  return (
    <div className="space-y-4">
      <BackLink />
      <Heading />

      {loading ? (
        <LoadingState />
      ) : !canAccess ? (
        <NotAvailableCard
          subTypeLabel={
            activeAccount.sub_type
              ? SUB_TYPE_LABELS[activeAccount.sub_type]
              : "—"
          }
        />
      ) : !partner ? (
        <PartnerRegistrationForm
          accountId={activeAccount.id}
          accountName={activeAccount.name}
          accountAvatarUrl={activeAccount.avatar_url ?? activeAccount.cover_url}
          subTypeLabel={
            activeAccount.sub_type
              ? SUB_TYPE_LABELS[activeAccount.sub_type]
              : "Organisation"
          }
          onCreated={(row) => setPartner(row)}
        />
      ) : (
        <PartnerProvider partner={partner}>
          <PartnerTabNav />
          <StatusBanner partner={partner} />
          {children}
        </PartnerProvider>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Zurück zum Dashboard
    </Link>
  );
}

function Heading() {
  return (
    <div className="flex items-center gap-2">
      <CreditCard className="h-5 w-5 text-primary" />
      <h1 className="text-2xl font-medium">Röbel Card</h1>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="h-10 bg-muted rounded animate-pulse" />
      <div className="h-48 bg-muted rounded-[10px] animate-pulse" />
    </div>
  );
}

function NotAvailableCard({ subTypeLabel }: { subTypeLabel: string }) {
  return (
    <div className="max-w-2xl bg-card border border-border rounded-[10px] p-6 flex gap-3">
      <ShieldAlert className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium">Nicht verfügbar für deinen Konto-Typ</p>
        <p className="text-sm text-muted-foreground mt-1">
          Die Röbel Card Partnerschaft steht nur Restaurants und Unternehmen
          offen. Dein Konto-Typ: {subTypeLabel}.
        </p>
      </div>
    </div>
  );
}
