import type React from "react";
import { TabNav } from "@/components/mini-apps/ui";

// Admin sub-layout for the Netizen Mini App review console. The parent
// /admin/dashboard layout already gates the session; this adds the tab nav
// shared across the review queue + analytics overview.
const TABS = [
  { href: "/admin/dashboard/mini-apps", label: "Prüfung" },
  { href: "/admin/dashboard/mini-apps/analytics", label: "Analytics" },
];

export default function MiniAppsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <TabNav tabs={TABS} />
      {children}
    </div>
  );
}
