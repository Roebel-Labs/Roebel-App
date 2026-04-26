"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "POIs", href: "/admin/dashboard/tourists/pois" },
  { label: "Fahrpläne", href: "/admin/dashboard/tourists/transit" },
  { label: "Touren", href: "/admin/dashboard/tourists/tours" },
  { label: "Wildlife", href: "/admin/dashboard/tourists/wildlife" },
];

export default function TouristsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-medium text-foreground mb-1">Touristen</h1>
        <p className="text-sm text-muted-foreground">
          POIs, Fahrpläne, Sternfahrten und Wildlife — redaktionell pflegen.
        </p>
      </div>

      <nav className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
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
