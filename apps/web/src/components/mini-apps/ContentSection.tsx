"use client";

// "Inhalte" — the mini-CMS for an app's shared content (mini_app_data, scope
// 'app'). The app reads these keys at runtime via sdk.data.get/list; editing
// here changes the live app WITHOUT re-publishing. Rendered as a structured
// database (CmsDatabase: tables → typed data grid → row editor), shared with
// the editor's Inhalte tab.
import { DetailCard } from "@/components/mini-apps/ui";
import { CmsDatabase } from "@/components/mini-apps/CmsDatabase";
import type { MiniAppRow } from "@/lib/miniapp/types";

export function ContentSection({ app, wallet }: { app: MiniAppRow; wallet?: string | null }) {
  return (
    <DetailCard title="Inhalte (Mini-CMS)">
      <p className="mb-2 text-xs text-muted-foreground">
        Inhalte, die deine App zur Laufzeit über{" "}
        <span className="font-mono">sdk.data.get(&quot;tabelle&quot;)</span> lädt — hier wie in
        einer Datenbank pflegen, ganz ohne neue Version.
      </p>
      <div className="-mx-1 overflow-hidden rounded-[10px] border border-border">
        <CmsDatabase app={app.id} wallet={wallet ?? null} />
      </div>
    </DetailCard>
  );
}
