"use client";

import type React from "react";
import { TabNav } from "@/components/mini-apps/ui";

// Builder sub-layout for the developer's Mini Apps. Inherits the /dashboard
// layout (org-account gate + top bar). The AI editor lives on the external
// /editor page — the tab below links out of the dashboard.
const TABS = [
  { href: "/dashboard/mini-apps", label: "Meine Apps" },
  { href: "/editor", label: "Mit KI erstellen" },
  { href: "/dashboard/mini-apps/import", label: "Importieren" },
  { href: "/dashboard/mini-apps/api", label: "API & MCP" },
];

export default function MiniAppsBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-5xl">
      <TabNav tabs={TABS} />
      {children}
    </div>
  );
}
