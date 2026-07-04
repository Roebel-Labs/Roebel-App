"use client";

import type React from "react";
import { usePathname } from "next/navigation";
import { TabNav } from "@/components/mini-apps/ui";

// Builder sub-layout for the developer's Mini Apps. Inherits the /dashboard
// layout (org-account gate + top bar). The AI builder at /new is a standalone
// full-viewport workspace and skips this chrome entirely.
const TABS = [
  { href: "/dashboard/mini-apps", label: "Meine Apps" },
  { href: "/dashboard/mini-apps/new", label: "Mit KI erstellen" },
  { href: "/dashboard/mini-apps/submit", label: "Manuell einreichen" },
];

export default function MiniAppsBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname?.startsWith("/dashboard/mini-apps/new")) {
    return <>{children}</>;
  }
  return (
    <div className="max-w-5xl">
      <TabNav tabs={TABS} />
      {children}
    </div>
  );
}
