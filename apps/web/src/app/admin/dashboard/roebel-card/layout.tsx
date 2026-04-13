"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Übersicht", href: "/admin/dashboard/roebel-card" },
  { label: "Transaktionen", href: "/admin/dashboard/roebel-card/purchases" },
  { label: "Vereine", href: "/admin/dashboard/roebel-card/vereine" },
  { label: "Partner", href: "/admin/dashboard/roebel-card/partners" },
];

export default function RoebelCardAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin/dashboard/roebel-card") {
      return pathname === href;
    }
    return pathname === href || pathname?.startsWith(href);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-medium text-foreground mb-1">Röbel Card</h1>
        <p className="text-sm text-muted-foreground">
          Transaktionen, Vereine und Treuhandkonto
        </p>
      </div>

      <nav className="flex items-center gap-1 border-b border-border">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              isActive(tab.href)
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div>{children}</div>
    </div>
  );
}
