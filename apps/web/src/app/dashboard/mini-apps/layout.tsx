"use client";

import type React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// The dashboard (root) and the public rankings page bring their own full
// chrome — render them bare. Sub-pages (import, api, [id], new, submit) get a
// slim top bar with the way back to the dashboard.
const BARE_ROUTES = ["/dashboard/mini-apps", "/dashboard/mini-apps/rankings"];

export default function MiniAppsBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (!pathname || BARE_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/dashboard/mini-apps" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Röbel App"
              width={24}
              height={24}
              className="h-6 w-6 object-contain"
            />
            <span className="text-sm font-semibold">Mini-App Dashboard</span>
          </Link>
          <Link
            href="/dashboard/mini-apps"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Zum Dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
