"use client";

import { PageHeader } from "@/components/mini-apps/ui";
import { AnalyticsPanel } from "@/components/mini-apps/AnalyticsPanel";

export default function MiniAppsAdminAnalytics() {
  return (
    <div>
      <PageHeader
        title="Mini Apps — Analytics"
        description="Plattformweite Nutzung aller Mini Apps: Öffnungen, aktive Wallets, Bindung und ausgezahlte Belohnungen."
      />
      <AnalyticsPanel appId="all" />
    </div>
  );
}
