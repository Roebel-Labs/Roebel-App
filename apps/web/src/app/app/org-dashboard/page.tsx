"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useActiveAccount } from "thirdweb/react";
import { getBusinessesByOwner, getBusinessDeals } from "@/app/actions/businesses";
import { createClient } from "@/lib/supabase/client";
import type { Business, BusinessDeal } from "@/types/business";
import {
  Store,
  Tag,
  Eye,
  MousePointerClick,
  TrendingUp,
  Settings,
  Plus,
  ArrowRight,
  Handshake,
  CreditCard,
  Users,
  Calendar,
  BarChart3,
} from "lucide-react";
import { useAppMode } from "@/lib/context/AppModeContext";
import { useAccount } from "@/lib/context/AccountContext";
import { isOrgAccount, ACCOUNT_TYPE_LABELS } from "@/types/account";

interface DashboardStats {
  totalViews: number;
  totalClicks: number;
  activeDeals: number;
  totalDeals: number;
  eventsCount: number;
  isRoebelPartner: boolean;
  partnerRedemptions: number;
}

export default function OrgDashboardPage() {
  const account = useActiveAccount();
  const { activeMode } = useAppMode();
  const { activeAccount } = useAccount();
  const isOrg = activeAccount ? isOrgAccount(activeAccount) : false;
  const [business, setBusiness] = useState<Business | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
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

      // Fetch deals and stats in parallel
      const [dealsResult, eventsRes, partnerRes] = await Promise.all([
        getBusinessDeals(biz.id),
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("organizer_wallet_address", account.address)
          .eq("status", "approved"),
        supabase
          .from("roebel_stamp_partners")
          .select("id, total_redemptions, is_active")
          .eq("business_id", biz.id)
          .eq("is_active", true)
          .limit(1),
      ]);

      const deals = dealsResult.success && dealsResult.data ? dealsResult.data : [];
      const activeDeals = deals.filter((d) => d.status === "active");
      const partner = partnerRes.data && partnerRes.data.length > 0 ? partnerRes.data[0] : null;

      setStats({
        totalViews: deals.reduce((sum, d) => sum + (d.views_count || 0), 0),
        totalClicks: deals.reduce((sum, d) => sum + (d.clicks_count || 0), 0),
        activeDeals: activeDeals.length,
        totalDeals: deals.length,
        eventsCount: eventsRes.count || 0,
        isRoebelPartner: !!partner,
        partnerRedemptions: partner?.total_redemptions || 0,
      });

      setLoading(false);
    }
    fetchDashboard();
  }, [account?.address]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
        <div className="h-24 bg-muted rounded-lg animate-pulse" />
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!business) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <Store className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <h2 className="text-lg font-medium text-foreground mb-2">Kein Gewerbe gefunden</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Registriere dein Gewerbe, um das Dashboard zu nutzen.
        </p>
        <Link
          href="/app/gewerbe/erstellen"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Gewerbe anmelden
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Org account header */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
            {isOrg && activeAccount?.avatar_url ? (
              <Image src={activeAccount.avatar_url} alt={activeAccount.name} width={48} height={48} className="object-cover w-full h-full" />
            ) : business.logo_url ? (
              <Image src={business.logo_url} alt={business.name} width={48} height={48} className="object-cover w-full h-full" />
            ) : (
              <Store className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">
              {isOrg && activeAccount ? activeAccount.name : business.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isOrg && activeAccount
                ? ACCOUNT_TYPE_LABELS[activeAccount.account_type]
                : (business.address || "Röbel/Müritz")}
            </p>
          </div>
          <Link
            href="/app/gewerbe/bearbeiten"
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            title="Gewerbe bearbeiten"
          >
            <Settings className="h-5 w-5 text-muted-foreground" />
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<Eye className="h-4 w-4 text-blue-500" />} label="Aufrufe" value={stats.totalViews} />
          <StatCard icon={<MousePointerClick className="h-4 w-4 text-green-500" />} label="Klicks" value={stats.totalClicks} />
          <StatCard icon={<Tag className="h-4 w-4 text-orange-500" />} label="Angebote" value={`${stats.activeDeals}/${stats.totalDeals}`} />
          <StatCard icon={<Calendar className="h-4 w-4 text-purple-500" />} label="Events" value={stats.eventsCount} />
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <QuickAction
          href="/app/gewerbe/angebote"
          icon={<Tag className="h-5 w-5 text-primary" />}
          title="Angebote verwalten"
          subtitle="Erstelle und verwalte Angebote"
        />
        <QuickAction
          href="/app/submit"
          icon={<Calendar className="h-5 w-5 text-purple-500" />}
          title="Event erstellen"
          subtitle="Veranstaltung planen"
        />
        <QuickAction
          href={`/app/gewerbe/${business.slug}`}
          icon={<Eye className="h-5 w-5 text-blue-500" />}
          title="Profil ansehen"
          subtitle="So sehen Kunden dein Gewerbe"
        />
        <QuickAction
          href="/app/gewerbe/bearbeiten"
          icon={<Settings className="h-5 w-5 text-muted-foreground" />}
          title="Gewerbe bearbeiten"
          subtitle="Name, Bilder, Öffnungszeiten"
        />
      </div>

      {/* Röbel Card Partner section */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Röbel Card Partner</h2>
        </div>
        {stats?.isRoebelPartner ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400">
                Aktiv
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Einlösungen</span>
              <span className="text-sm font-medium text-foreground">{stats.partnerRedemptions}</span>
            </div>
            <Link
              href="/app/org-dashboard/partner"
              className="flex items-center justify-center gap-2 w-full py-2 bg-muted hover:bg-accent text-foreground rounded-lg text-sm font-medium transition-colors"
            >
              <Handshake className="h-4 w-4" />
              Partner-Dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Werde Röbel Card Partner und biete Stempelkarten, Punkte-Multiplikatoren oder exklusive Angebote an.
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-muted rounded-lg">
                <p className="text-xs font-medium text-foreground">Stempelkarte</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Treue belohnen</p>
              </div>
              <div className="p-2 bg-muted rounded-lg">
                <p className="text-xs font-medium text-foreground">Punkte ×2</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Mehr Punkte</p>
              </div>
              <div className="p-2 bg-muted rounded-lg">
                <p className="text-xs font-medium text-foreground">Exklusiv</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">VIP-Zugang</p>
              </div>
            </div>
            <Link
              href="/app/org-dashboard/partner"
              className="flex items-center justify-center gap-2 w-full py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors"
            >
              <Handshake className="h-4 w-4" />
              Partner werden
            </Link>
          </div>
        )}
      </div>

      {/* Org type info */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Organisationstyp</h2>
        <div className="grid grid-cols-2 gap-2">
          <OrgTypeCard label="Gewerbe" description="Geschäft, Laden, Gastro" active={activeAccount?.sub_type === "unternehmen"} />
          <OrgTypeCard label="Verein" description="Sport, Kultur, Soziales" active={activeAccount?.sub_type === "verein"} />
          <OrgTypeCard label="Partei" description="Politische Partei" active={activeAccount?.sub_type === "partei"} />
          <OrgTypeCard label="Fraktion" description="Parlamentarische Fraktion" active={activeAccount?.sub_type === "fraktion"} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function QuickAction({ href, icon, title, subtitle }: { href: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:bg-accent transition-colors"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </Link>
  );
}

function OrgTypeCard({ label, description, active }: { label: string; description: string; active: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${active ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"}`}>
      <p className={`text-sm font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      {active && <span className="text-[10px] font-medium text-primary mt-1 inline-block">Aktiv</span>}
    </div>
  );
}
