"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  Newspaper,
  Vote,
  Store,
  Tag,
  ShoppingBag,
  ShieldCheck,
  MessageSquare,
  User,
  Settings,
  HelpCircle,
  Info,
  Plus,
  MapPin,
  Landmark,
  Wallet,
  LayoutDashboard,
  Cog,
  Users,
  Compass,
} from "lucide-react";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { NotificationDot } from "@/components/ui/notification-dot";
import { useAppMode, type AppMode } from "@/lib/context/AppModeContext";
import { RoebelCardWidget } from "@/components/app/RoebelCardWidget";

// --- Navigation item definition ---

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  /** Which modes can see this item. undefined = all modes. */
  modes?: AppMode[];
  /** If set, item is visible but shows a restricted state (e.g. "browse only") */
  restrictedIn?: AppMode[];
}

const mainNavItems: NavItem[] = [
  { href: "/app", label: "Feed", icon: Home, exact: true },
  { href: "/app/proposals", label: "Rathaus", icon: Landmark },
  { href: "/app/events", label: "Veranstaltungen", icon: Calendar },
  { href: "/app/karte", label: "Karte", icon: MapPin },
  { href: "/app/entdecken", label: "Entdecken", icon: Compass },
  { href: "/app/news", label: "Neuigkeiten", icon: Newspaper },
  { href: "/app/gewerbe", label: "Gewerbe", icon: Store },
  { href: "/app/angebote", label: "Angebote", icon: Tag },
  { href: "/app/marktplatz", label: "Marktplatz", icon: ShoppingBag },
  { href: "/app/graph", label: "Bürger-Netzwerk", icon: Users, modes: ["citizen", "org"] },
  { href: "/app/verifizierung", label: "Verifizierung", icon: ShieldCheck, modes: ["citizen", "org"] },
  { href: "/app/messages", label: "Nachrichten", icon: MessageSquare, modes: ["citizen", "org"] },
  { href: "/app/profile", label: "Profil", icon: User },
];

const orgNavItems: NavItem[] = [
  { href: "/app/gewerbe/bearbeiten", label: "Dashboard", icon: LayoutDashboard, modes: ["org"] },
  { href: "/app/gewerbe/angebote", label: "Verwalten", icon: Cog, modes: ["org"] },
];

const bottomNavItems: NavItem[] = [
  { href: "/app/einstellungen", label: "Einstellungen", icon: Settings },
  { href: "/app/support", label: "Hilfecenter", icon: HelpCircle },
  { href: "/about", label: "Über uns", icon: Info },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { unreadCount: unreadMessages } = useUnreadMessages();
  const { activeMode } = useAppMode();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname?.startsWith(href + "/");
  };

  const isVisible = (item: NavItem) => {
    if (!item.modes) return true;
    return item.modes.includes(activeMode);
  };

  const visibleMainItems = mainNavItems.filter(isVisible);
  const visibleOrgItems = orgNavItems.filter(isVisible);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Logo */}
      <div className="h-16 flex items-center gap-2 px-5 flex-shrink-0 lg:justify-start justify-center">
        <Image
          src="/logo.png"
          alt="Röbel App Logo"
          width={28}
          height={28}
          className="object-contain"
        />
        <span className="text-lg font-medium text-foreground hidden lg:inline">Röbel App</span>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 lg:px-3">
        <div className="space-y-1">
          {visibleMainItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors justify-center lg:justify-start ${
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                title={item.label}
              >
                <Icon className={`h-5 w-5 flex-shrink-0 ${active ? "text-foreground" : "text-muted-foreground"}`} />
                <span className="flex-1 hidden lg:block">{item.label}</span>
                {item.href === "/app/messages" && unreadMessages > 0 && (
                  <>
                    <span className="hidden lg:block">
                      <NotificationDot count={unreadMessages} showNumber size="md" />
                    </span>
                    <span className="absolute top-1 right-1 lg:hidden">
                      <NotificationDot count={unreadMessages} size="sm" />
                    </span>
                  </>
                )}
              </Link>
            );
          })}
        </div>

        {/* Org-only section */}
        {visibleOrgItems.length > 0 && (
          <>
            <div className="my-4 mx-3 border-t border-border" />
            <div className="space-y-1">
              {visibleOrgItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors justify-center lg:justify-start ${
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={item.label}
                  >
                    <Icon className={`h-5 w-5 flex-shrink-0 ${active ? "text-foreground" : "text-muted-foreground"}`} />
                    <span className="flex-1 hidden lg:block">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* Contribute button */}
        <div className="mt-6 px-0 lg:px-3">
          <Link
            href="/app/submit"
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-sm font-semibold transition-colors"
            title="Beitragen"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden lg:inline">Beitragen</span>
          </Link>
        </div>

        {/* Röbel Card widget — desktop expanded only */}
        <div className="mt-4 px-0 lg:px-3 hidden lg:block">
          <RoebelCardWidget />
        </div>
      </nav>

      {/* Bottom section */}
      <div className="py-3 px-2 lg:px-3">
        <div className="space-y-1">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-accent-foreground hover:bg-accent transition-colors justify-center lg:justify-start"
                title={item.label}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
