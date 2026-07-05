"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, PartyPopper, Plus, Rocket, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  ErrorState,
  SkeletonGrid,
  StatusBadge,
  AppIcon,
  categoryLabel,
} from "@/components/mini-apps/ui";
import { useMiniAppApi } from "@/components/mini-apps/client";
import { useWalletAddress } from "@/components/mini-apps/useWallet";
import type { MiniAppRow } from "@/lib/miniapp/types";
import { timeAgo } from "@/components/admin/muenzen/format";

// Sommer-Camp-Teilnehmer landen nach der Anmeldung mit ?welcome=sommercamp hier.
function SommercampWelcome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  if (searchParams.get("welcome") !== "sommercamp") return null;
  return (
    <Card className="mb-4 flex items-center gap-3 border-[#FFD84D] bg-[#FFD84D]/15 p-4">
      <PartyPopper className="h-5 w-5 shrink-0 text-[#00498B]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Willkommen beim Sommer Camp!</p>
        <p className="text-xs text-muted-foreground">
          Du bist angemeldet. Erstelle jetzt deine erste Mini-App mit KI.
        </p>
      </div>
      <Link href="/editor">
        <Button size="sm">Mit KI erstellen</Button>
      </Link>
      <button
        type="button"
        aria-label="Hinweis schließen"
        onClick={() => router.replace("/dashboard/mini-apps")}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </Card>
  );
}

export default function MyMiniApps() {
  const wallet = useWalletAddress();
  const { data, loading, error, refresh, refreshing } = useMiniAppApi<{ apps: MiniAppRow[] }>(
    wallet ? "list?mine=1" : null,
    wallet,
  );
  const apps = data?.apps ?? [];

  return (
    <div>
      {/* useSearchParams braucht beim Prerender eine Suspense-Grenze */}
      <Suspense fallback={null}>
        <SommercampWelcome />
      </Suspense>
      <PageHeader
        title="Meine Mini Apps"
        description="Baue Mini Apps für die Röbel App — mit KI oder manuell. Nach dem Einreichen prüft ein Admin deine App, testet sie im Playground und schaltet sie live."
        onRefresh={refresh}
        refreshing={refreshing}
      >
        <div className="flex gap-2">
          <Link href="/editor">
            <Button size="sm">Mit KI erstellen</Button>
          </Link>
          <Link href="/dashboard/mini-apps/submit">
            <Button size="sm" variant="outline">
              <Plus className="mr-1 h-4 w-4" /> Manuell
            </Button>
          </Link>
        </div>
      </PageHeader>

      {!wallet ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Verbinde dich, um deine Mini Apps zu sehen.
        </Card>
      ) : error ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : loading && !data ? (
        <SkeletonGrid count={3} />
      ) : apps.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00498B]/10">
            <Rocket className="h-5 w-5 text-[#00498B]" />
          </div>
          <div>
            <p className="font-semibold">Noch keine Mini App</p>
            <p className="text-sm text-muted-foreground">
              Erstelle deine erste App mit KI oder reiche eine bestehende Web-App ein.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/editor">
              <Button size="sm">Mit KI starten</Button>
            </Link>
            <Link href="/dashboard/mini-apps/submit">
              <Button size="sm" variant="outline">
                Manuell einreichen
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {apps.map((app) => (
            <Card
              key={app.id}
              className="flex items-center gap-3 p-3 transition-colors hover:bg-accent"
            >
              <Link
                href={`/dashboard/mini-apps/${app.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <AppIcon name={app.name} iconUrl={app.icon_url} color={app.primary_color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{app.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {categoryLabel(app.category)} · {timeAgo(Date.parse(app.updated_at))}
                  </p>
                </div>
                <StatusBadge status={app.status} />
              </Link>
              {app.source === "ai_builder" ? (
                <Link
                  href={`/editor?app=${app.slug}`}
                  title="Im KI-Baukasten öffnen"
                  aria-label={`${app.name} im KI-Baukasten öffnen`}
                  className="flex h-8 shrink-0 items-center rounded-[10px] border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-background hover:text-primary"
                >
                  KI-Editor
                </Link>
              ) : null}
              <Link href={`/dashboard/mini-apps/${app.id}`} aria-hidden tabIndex={-1}>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
