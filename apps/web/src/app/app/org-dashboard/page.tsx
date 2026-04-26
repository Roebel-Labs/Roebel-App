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
  Settings,
  Plus,
  Handshake,
  CreditCard,
  Calendar,
  FileText,
  Users,
} from "lucide-react";
import { useAccount } from "@/lib/context/AccountContext";
import {
  isOrgAccount,
  SUB_TYPE_LABELS,
  subTypeFeatures,
  canPublishBlog,
} from "@/types/account";

interface BusinessStats {
  totalViews: number;
  totalClicks: number;
  activeDeals: number;
  totalDeals: number;
  eventsCount: number;
  isRoebelPartner: boolean;
  partnerRedemptions: number;
}

interface OrgStats {
  draftPosts: number;
  publishedPosts: number;
  totalPostViews: number;
  membersCount: number;
  eventsCount: number;
}

export default function OrgDashboardPage() {
  const wallet = useActiveAccount();
  const { activeAccount } = useAccount();
  const isOrg = activeAccount ? isOrgAccount(activeAccount) : false;
  const subType = activeAccount?.sub_type ?? null;
  const features = subTypeFeatures(subType);

  const [business, setBusiness] = useState<Business | null>(null);
  const [bizStats, setBizStats] = useState<BusinessStats | null>(null);
  const [orgStats, setOrgStats] = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOrg || !activeAccount) return;
    setLoading(true);
    const accountId = activeAccount.id;
    const wallet_address = wallet?.address;
    const supabase = createClient();

    const loadGenericOrgStats = async () => {
      const [postsRes, membersRes, eventsRes] = await Promise.all([
        supabase
          .from("blog_articles")
          .select("status, view_count")
          .eq("account_id", accountId),
        supabase
          .from("account_owners")
          .select("wallet_address", { count: "exact", head: true })
          .eq("account_id", accountId),
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId),
      ]);

      const posts = postsRes.data || [];
      setOrgStats({
        draftPosts: posts.filter((p) => p.status === "draft").length,
        publishedPosts: posts.filter((p) => p.status === "published").length,
        totalPostViews: posts.reduce((s, p) => s + (p.view_count || 0), 0),
        membersCount: membersRes.count || 0,
        eventsCount: eventsRes.count || 0,
      });
    };

    const loadBusinessStats = async () => {
      if (!wallet_address) {
        setLoading(false);
        return;
      }
      const bizResult = await getBusinessesByOwner(wallet_address);
      if (!bizResult.success || !bizResult.data || bizResult.data.length === 0) {
        return;
      }
      const biz = bizResult.data[0];
      setBusiness(biz);

      const [dealsResult, eventsRes, partnerRes] = await Promise.all([
        getBusinessDeals(biz.id),
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("organizer_wallet_address", wallet_address)
          .eq("status", "approved"),
        supabase
          .from("roebel_stamp_partners")
          .select("id, total_redemptions, is_active")
          .eq("business_id", biz.id)
          .eq("is_active", true)
          .limit(1),
      ]);

      const deals: BusinessDeal[] =
        dealsResult.success && dealsResult.data ? dealsResult.data : [];
      const activeDeals = deals.filter((d) => d.status === "active");
      const partner =
        partnerRes.data && partnerRes.data.length > 0 ? partnerRes.data[0] : null;

      setBizStats({
        totalViews: deals.reduce((s, d) => s + (d.views_count || 0), 0),
        totalClicks: deals.reduce((s, d) => s + (d.clicks_count || 0), 0),
        activeDeals: activeDeals.length,
        totalDeals: deals.length,
        eventsCount: eventsRes.count || 0,
        isRoebelPartner: !!partner,
        partnerRedemptions: partner?.total_redemptions || 0,
      });
    };

    Promise.all([
      loadGenericOrgStats(),
      features.partner ? loadBusinessStats() : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, [activeAccount, isOrg, wallet?.address, features.partner]);

  if (!isOrg || !activeAccount) return null;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
        <div className="h-24 bg-muted rounded-lg animate-pulse" />
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  const subLabel = subType ? SUB_TYPE_LABELS[subType] : "Organisation";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
            {activeAccount.avatar_url ? (
              <Image
                src={activeAccount.avatar_url}
                alt={activeAccount.name}
                width={48}
                height={48}
                className="object-cover w-full h-full"
              />
            ) : (
              <Store className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">
              {activeAccount.name}
            </h1>
            <p className="text-xs text-muted-foreground">{subLabel}</p>
          </div>
          <Link
            href="/app/org-dashboard/profile"
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            title="Profil bearbeiten"
          >
            <Settings className="h-5 w-5 text-muted-foreground" />
          </Link>
        </div>
      </div>

      {/* Extern banner */}
      {activeAccount.is_extern && activeAccount.extern_status !== "approved" && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-4 text-sm text-amber-900 dark:text-amber-200">
          Dein externes Konto wartet auf Freigabe. Du kannst Profil und Inhalte
          vorbereiten, aber noch nicht veröffentlichen.
        </div>
      )}

      {/* Generic org stats — visible to every sub_type */}
      {orgStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<FileText className="h-4 w-4 text-blue-500" />}
            label="Veröffentlicht"
            value={orgStats.publishedPosts}
          />
          <StatCard
            icon={<FileText className="h-4 w-4 text-amber-500" />}
            label="Entwürfe"
            value={orgStats.draftPosts}
          />
          <StatCard
            icon={<Eye className="h-4 w-4 text-emerald-500" />}
            label="Artikel-Views"
            value={orgStats.totalPostViews}
          />
          <StatCard
            icon={<Users className="h-4 w-4 text-purple-500" />}
            label="Mitglieder"
            value={orgStats.membersCount}
          />
        </div>
      )}

      {/* Business-specific stats */}
      {features.ads && bizStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<Eye className="h-4 w-4 text-blue-500" />}
            label="Aufrufe"
            value={bizStats.totalViews}
          />
          <StatCard
            icon={<MousePointerClick className="h-4 w-4 text-green-500" />}
            label="Klicks"
            value={bizStats.totalClicks}
          />
          <StatCard
            icon={<Tag className="h-4 w-4 text-orange-500" />}
            label="Angebote"
            value={`${bizStats.activeDeals}/${bizStats.totalDeals}`}
          />
          <StatCard
            icon={<Calendar className="h-4 w-4 text-purple-500" />}
            label="Events"
            value={bizStats.eventsCount}
          />
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {features.blog && canPublishBlog(activeAccount) && (
          <QuickAction
            href="/app/org-dashboard/blog/new"
            icon={<Plus className="h-5 w-5 text-primary" />}
            title="Neuer Blog-Artikel"
            subtitle="Schreibe und veröffentliche"
          />
        )}
        {features.ads && (
          <QuickAction
            href="/app/gewerbe/angebote"
            icon={<Tag className="h-5 w-5 text-orange-500" />}
            title="Angebote verwalten"
            subtitle="Erstelle und verwalte Angebote"
          />
        )}
        {features.events && (
          <QuickAction
            href="/app/submit"
            icon={<Calendar className="h-5 w-5 text-purple-500" />}
            title="Event erstellen"
            subtitle="Veranstaltung planen"
          />
        )}
        {features.members && (
          <QuickAction
            href="/app/org-dashboard/members"
            icon={<Users className="h-5 w-5 text-blue-500" />}
            title="Mitglieder verwalten"
            subtitle="Einladen und Rollen ändern"
          />
        )}
        <QuickAction
          href="/app/org-dashboard/profile"
          icon={<Settings className="h-5 w-5 text-muted-foreground" />}
          title="Profil bearbeiten"
          subtitle="Name, Bilder, Beschreibung"
        />
      </div>

      {/* Röbel Card Partner section — only for restaurants/businesses */}
      {features.partner && business && bizStats && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Röbel Card Partner
            </h2>
          </div>
          {bizStats.isRoebelPartner ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400">
                  Aktiv
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Einlösungen
                </span>
                <span className="text-sm font-medium text-foreground">
                  {bizStats.partnerRedemptions}
                </span>
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
            <Link
              href="/app/org-dashboard/partner"
              className="flex items-center justify-center gap-2 w-full py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors"
            >
              <Handshake className="h-4 w-4" />
              Partner werden
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
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
