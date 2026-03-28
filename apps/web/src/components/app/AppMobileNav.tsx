"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, PlusCircle, MessageSquare, User } from "lucide-react";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { NotificationDot } from "@/components/ui/notification-dot";

const mobileNavItems = [
  { href: "/app", label: "Start", icon: Home, exact: true },
  { href: "/app/events", label: "Events", icon: Calendar },
  { href: "/app/submit", label: "Beitragen", icon: PlusCircle, highlight: true },
  { href: "/app/messages", label: "Chat", icon: MessageSquare },
  { href: "/app/profile", label: "Profil", icon: User },
];

export function AppMobileNav() {
  const pathname = usePathname();
  const { unreadCount: unreadMessages } = useUnreadMessages();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname?.startsWith(href + "/");
  };

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-md transition-colors ${
                item.highlight
                  ? "text-primary"
                  : active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${item.highlight ? "text-primary" : ""}`} />
              {item.href === "/app/messages" && unreadMessages > 0 && (
                <span className="absolute top-0 right-1">
                  <NotificationDot count={unreadMessages} size="sm" />
                </span>
              )}
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
