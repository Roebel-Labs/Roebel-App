"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  Newspaper,
  Vote,
  Users,
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
} from "lucide-react";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { NotificationDot } from "@/components/ui/notification-dot";

const mainNavItems = [
  { href: "/app", label: "Start", icon: Home, exact: true },
  { href: "/app/events", label: "Veranstaltungen", icon: Calendar },
  { href: "/app/news", label: "Neuigkeiten", icon: Newspaper },
  { href: "/app/proposals", label: "Vorschläge", icon: Vote },
  { href: "/app/gewerbe", label: "Gewerbe", icon: Store },
  { href: "/app/angebote", label: "Angebote", icon: Tag },
  { href: "/app/marktplatz", label: "Marktplatz", icon: ShoppingBag },
  { href: "/app/karte", label: "Karte", icon: MapPin },
  { href: "/app/graph", label: "Bürger-Netzwerk", icon: Users },
  { href: "/app/verifizierung", label: "Verifizierung", icon: ShieldCheck },
  { href: "/app/messages", label: "Nachrichten", icon: MessageSquare },
  { href: "/app/profile", label: "Profil", icon: User },
];

const bottomNavItems = [
  { href: "/app/einstellungen", label: "Einstellungen", icon: Settings },
  { href: "/app/support", label: "Hilfecenter", icon: HelpCircle },
  { href: "/about", label: "Über uns", icon: Info },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { unreadCount: unreadMessages } = useUnreadMessages();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname?.startsWith(href + "/");
  };

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
          {mainNavItems.map((item) => {
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
