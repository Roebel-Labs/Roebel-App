"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  ErrorState,
  StatusBadge,
  AppIcon,
  categoryLabel,
  InfoRow,
  DetailCard,
  MiniAppPreviewRow,
} from "@/components/mini-apps/ui";
import { AnalyticsPanel } from "@/components/mini-apps/AnalyticsPanel";
import { ManifestForm } from "@/components/mini-apps/ManifestForm";
import { useMiniAppApi, miniAppWrite } from "@/components/mini-apps/client";
import { useWalletAddress } from "@/components/mini-apps/useWallet";
import type { MiniAppManifest, MiniAppRow, MiniAppVersionRow } from "@/lib/miniapp/types";
import { timeAgo } from "@/components/admin/muenzen/format";

const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

export default function BuilderMiniAppDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const wallet = useWalletAddress();
  const { data, loading, error, refresh } = useMiniAppApi<{
    app: MiniAppRow;
    versions: MiniAppVersionRow[];
  }>(`${id}`, wallet);

  const app = data?.app;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(manifest: MiniAppManifest) {
    if (!wallet) return;
    setBusy(true);
    setSaveError(null);
    try {
      await miniAppWrite(`${id}`, "PATCH", { manifest, wallet }, wallet);
      setEditing(false);
      refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState error={error} onRetry={refresh} />;
  if (loading || !app) {
    return <div className="h-40 animate-pulse rounded-[10px] border border-border bg-muted/40" />;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/mini-apps"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Meine Apps
      </Link>

      <PageHeader title={app.name} description={app.description ?? undefined}>
        <StatusBadge status={app.status} />
      </PageHeader>

      {app.status === "rejected" && app.review_notes && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-medium">Abgelehnt</p>
          <p className="mt-0.5">{app.review_notes}</p>
        </div>
      )}
      {app.status === "pending" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Deine App ist in Prüfung. Ein Admin testet sie im Playground und gibt sie frei.
        </div>
      )}

      {saveError && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {saveError}
        </div>
      )}

      {editing ? (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Manifest bearbeiten</h2>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Abbrechen
            </Button>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Änderungen setzen die App zurück in die Prüfung.
          </p>
          <ManifestForm app={app} submitLabel="Speichern & erneut einreichen" onSubmit={save} busy={busy} />
        </Card>
      ) : (
        <DetailCard
          title="Manifest"
          action={
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Bearbeiten
            </Button>
          }
        >
          <div className="flex items-start gap-3">
            <AppIcon name={app.name} iconUrl={app.icon_url} color={app.primary_color} size={56} />
            <div className="min-w-0 flex-1 divide-y divide-border">
              <InfoRow label="slug">
                <span className="font-mono">{app.slug}</span>
              </InfoRow>
              <InfoRow label="Kategorie">{categoryLabel(app.category)}</InfoRow>
              <InfoRow label="home_url">
                <a
                  href={app.home_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#00498B] hover:underline"
                >
                  {app.home_url.replace(/^https?:\/\//, "").slice(0, 40)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </InfoRow>
              <InfoRow label="Berechtigungen">
                {app.permissions.length ? app.permissions.join(", ") : "keine"}
              </InfoRow>
              <InfoRow label="Belohnungs-Budget">
                {nf.format(app.reward_spent)} / {nf.format(app.reward_budget)} RÖ
              </InfoRow>
              <InfoRow label="Aktualisiert">{timeAgo(Date.parse(app.updated_at))}</InfoRow>
            </div>
          </div>
          <MiniAppPreviewRow images={app.screenshots} className="mt-4" />
        </DetailCard>
      )}

      {/* Analytics (developer reads their own app via wallet header) */}
      <AnalyticsPanel appId={app.id} wallet={wallet} />
    </div>
  );
}
