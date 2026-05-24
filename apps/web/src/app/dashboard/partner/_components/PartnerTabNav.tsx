"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/partner", label: "Übersicht" },
  { href: "/dashboard/partner/transactions", label: "Transaktionen" },
  { href: "/dashboard/partner/offers", label: "Angebote" },
  { href: "/dashboard/partner/employees", label: "Mitarbeiter" },
  { href: "/dashboard/partner/payouts", label: "Auszahlungen" },
  { href: "/dashboard/partner/settings", label: "Einstellungen" },
] as const;

export function PartnerTabNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
      <ul className="flex gap-1 min-w-max">
        {TABS.map((tab) => {
          const isActive =
            tab.href === "/dashboard/partner"
              ? pathname === tab.href
              : pathname?.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "inline-flex items-center px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
