"use client";

import Link from "next/link";
import { useAppMode } from "@/lib/context/AppModeContext";
import { useAccount } from "@/lib/context/AccountContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { isOrgAccount } from "@/types/account";
import {
  CreditCard,
  Compass,
  Bookmark,
  ShieldCheck,
  Vote,
  Rocket,
  LayoutDashboard,
  Settings,
  Handshake,
  MessageSquare,
  Wallet,
  Bell,
  HelpCircle,
  LogOut,
} from "lucide-react";

interface ProfileCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}

function ProfileCard({ href, icon, title, subtitle }: ProfileCardProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:bg-accent hover:border-border/80 transition-all"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>
    </Link>
  );
}

export function ModeProfileSections() {
  const { activeMode } = useAppMode();
  const { activeAccount } = useAccount();
  const { user } = useUserProfile();

  const isCitizen = user?.tier === "citizen" || user?.is_verified_citizen;
  const isOrg = activeAccount ? isOrgAccount(activeAccount) : false;
  const isTouristOrGuest = !isCitizen;

  return (
    <div className="space-y-3">
      {/* Mode-specific cards */}
      {isTouristOrGuest && (
        <>
          <ProfileCard
            href="/app/events"
            icon={<Compass className="h-5 w-5 text-primary" />}
            title="Röbel entdecken"
            subtitle="Events, Restaurants, Sehenswürdigkeiten"
          />
          <ProfileCard
            href="/app/karte"
            icon={<Bookmark className="h-5 w-5 text-orange-500" />}
            title="Karte"
            subtitle="Alles auf einen Blick"
          />
          {/* Verification CTA */}
          <Link
            href="/app/verifizierung"
            className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg hover:bg-primary/10 transition-colors"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 flex-shrink-0">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Bürger werden</p>
              <p className="text-xs text-muted-foreground">
                Verifiziere dich und erhalte Stimmrecht
              </p>
            </div>
          </Link>
        </>
      )}

      {isCitizen && !isOrg && (
        <>
          <ProfileCard
            href="/app/proposals"
            icon={<Vote className="h-5 w-5 text-primary" />}
            title="Rathaus"
            subtitle="Abstimmungen & Bürgerbeteiligung"
          />
          <ProfileCard
            href="/app/gewerbe/erstellen"
            icon={<Rocket className="h-5 w-5 text-green-600" />}
            title="Mach's in Röbel"
            subtitle="Gewerbe, Verein, Stadt gründen"
          />
          <ProfileCard
            href="/app/verifizierung"
            icon={<ShieldCheck className="h-5 w-5 text-blue-500" />}
            title="Verifizierung"
            subtitle="Bürger-Pass & Bescheiniger"
          />
        </>
      )}

      {isOrg && (
        <>
          <ProfileCard
            href="/dashboard"
            icon={<LayoutDashboard className="h-5 w-5 text-primary" />}
            title="Dashboard"
            subtitle="Statistiken & Reichweite"
          />
          <ProfileCard
            href="/dashboard/ads"
            icon={<Settings className="h-5 w-5 text-orange-500" />}
            title="Verwalten"
            subtitle="Angebote, Events, Mitglieder"
          />
          <ProfileCard
            href="/app/proposals"
            icon={<Handshake className="h-5 w-5 text-green-600" />}
            title="Röbel Card Partner"
            subtitle="Stempel, Angebote, Statistiken"
          />
        </>
      )}

      {/* Shared menu items — all modes */}
      <div className="border-t border-border pt-3 mt-3 space-y-1">
        <SharedMenuItem href="/app/einstellungen" icon={<Settings className="h-4 w-4" />} label="Einstellungen" />
        <SharedMenuItem href="/app/messages" icon={<MessageSquare className="h-4 w-4" />} label="Nachrichten" />
        <SharedMenuItem href="/app/notifications" icon={<Bell className="h-4 w-4" />} label="Benachrichtigungen" />
        <SharedMenuItem href="/app/support" icon={<HelpCircle className="h-4 w-4" />} label="Hilfe" />
      </div>
    </div>
  );
}

function SharedMenuItem({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      {icon}
      {label}
    </Link>
  );
}
