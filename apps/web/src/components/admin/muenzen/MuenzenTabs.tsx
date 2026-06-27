"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/dashboard/muenzen", label: "Übersicht" },
  { href: "/admin/dashboard/muenzen/geldfluss", label: "Geldfluss" },
  { href: "/admin/dashboard/muenzen/vertrauen", label: "Vertrauen & Reputation" },
  { href: "/admin/dashboard/muenzen/wallets", label: "Wallets & Kasse" },
  { href: "/admin/dashboard/muenzen/belohnungen", label: "Belohnungen & Senken" },
];

export function MuenzenTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 -mt-1 overflow-x-auto border-b border-border">
      <nav className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#00498B]" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
