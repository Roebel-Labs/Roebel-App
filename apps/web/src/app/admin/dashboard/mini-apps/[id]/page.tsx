"use client";

import { use, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  X,
  Ban,
  Star,
  Coins,
  ExternalLink,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { ContentSection } from "@/components/mini-apps/ContentSection";
import { ImagesSection } from "@/components/mini-apps/ImagesSection";
import { IndexedSourceCard } from "@/components/mini-apps/IndexedSourceCard";
import { ManifestForm } from "@/components/mini-apps/ManifestForm";
import { NotificationsSection } from "@/components/mini-apps/NotificationsSection";
import { Playground } from "@/components/mini-apps/Playground";
import { useMiniAppApi, miniAppWrite } from "@/components/mini-apps/client";
import type { MiniAppRow, MiniAppVersionRow } from "@/lib/miniapp/types";
import { timeAgo } from "@/components/admin/muenzen/format";

// Manifest keys (camelCase, as stored on a version) <-> live row columns.
const DIFF_FIELDS: { label: string; key: string; col: keyof MiniAppRow }[] = [
  { label: "Name", key: "name", col: "name" },
  { label: "Beschreibung", key: "description", col: "description" },
  { label: "Icon", key: "iconUrl", col: "icon_url" },
  { label: "Start-URL", key: "homeUrl", col: "home_url" },
  { label: "Kategorie", key: "category", col: "category" },
  { label: "Tags", key: "tags", col: "tags" },
  { label: "Screenshots", key: "screenshots", col: "screenshots" },
  { label: "Berechtigungen", key: "permissions", col: "permissions" },
  { label: "Primärfarbe", key: "primaryColor", col: "primary_color" },
];

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "–";
  return typeof v === "string" ? v : JSON.stringify(v);
}

function pendingDiff(app: MiniAppRow, versions: MiniAppVersionRow[]) {
  const latest = versions
    .filter((v) => v.status === "pending")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (!latest) return [];
  const raw = latest.manifest as Record<string, unknown>;
  const m = (raw.miniapp && typeof raw.miniapp === "object" ? raw.miniapp : raw) as Record<string, unknown>;
  return DIFF_FIELDS.flatMap((f) => {
    const oldV = fmtVal(app[f.col]);
    const newV = fmtVal(m[f.key]);
    return oldV === newV ? [] : [{ label: f.label, oldV, newV }];
  });
}

const nf = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

export default function MiniAppAdminDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, loading, error, refresh } = useMiniAppApi<{
    app: MiniAppRow;
    versions: MiniAppVersionRow[];
  }>(`${id}`);

  const app = data?.app;

  const [notes, setNotes] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingManifest, setEditingManifest] = useState(false);
  const [ownerWallet, setOwnerWallet] = useState("");

  async function act(label: string, fn: () => Promise<unknown>, successMessage?: string) {
    setBusy(label);
    setActionError(null);
    try {
      await fn();
      refresh();
      if (successMessage) toast.success(successMessage);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setActionError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorState error={error} onRetry={refresh} />;
  if (loading || !app) {
    return <div className="h-40 animate-pulse rounded-[10px] border border-border bg-muted/40" />;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/dashboard/mini-apps"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Zurück zur Prüfung
      </Link>

      <PageHeader title={app.name} description={app.description ?? undefined}>
        <StatusBadge status={app.status} />
      </PageHeader>

      {actionError && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {actionError}
        </div>
      )}

      {app.origin && <IndexedSourceCard app={app} wallet={null} onReindexed={refresh} admin />}

      {app.pending_update && (
        <DetailCard title="Änderungen">
          {(() => {
            const diff = pendingDiff(app, data?.versions ?? []);
            return diff.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine sichtbaren Feldunterschiede.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {diff.map((d) => (
                  <li key={d.label} className="break-words">
                    <span className="font-medium">{d.label}:</span>{" "}
                    <span className="text-muted-foreground line-through">{d.oldV}</span>{" "}
                    → <span>{d.newV}</span>
                  </li>
                ))}
              </ul>
            );
          })()}
        </DetailCard>
      )}

      {/* Review actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <DetailCard title="Freigabe">
          <Textarea
            placeholder="Prüfnotiz (optional, für Ablehnung empfohlen)…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mb-3 text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              disabled={busy != null}
              onClick={() =>
                act(
                  "approve",
                  () =>
                    miniAppWrite("review", "POST", { id: app.id, decision: "approve", notes }),
                  `"${app.name}" freigegeben — die App ist jetzt live.`,
                )
              }
            >
              <Check className="mr-1 h-4 w-4" /> Freigeben
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
              disabled={busy != null}
              onClick={() =>
                act(
                  "reject",
                  () =>
                    miniAppWrite("review", "POST", { id: app.id, decision: "reject", notes }),
                  `"${app.name}" abgelehnt.`,
                )
              }
            >
              <X className="mr-1 h-4 w-4" /> Ablehnen
            </Button>
          </div>
          {app.status !== "pending" && app.status !== "draft" && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full justify-start"
              disabled={busy != null}
              onClick={() =>
                act(
                  "reset",
                  () => miniAppWrite("review", "POST", { id: app.id, decision: "reset", notes }),
                  `"${app.name}" zurück in die Prüfung gesetzt.`,
                )
              }
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Zurück in Prüfung
            </Button>
          )}
          {app.review_notes && (
            <p className="mt-3 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
              Letzte Notiz: {app.review_notes}
            </p>
          )}
        </DetailCard>

        <DetailCard title="Belohnungs-Budget">
          <InfoRow label="Budget">{nf.format(app.reward_budget)} RÖ</InfoRow>
          <InfoRow label="Ausgegeben">{nf.format(app.reward_spent)} RÖ</InfoRow>
          <div className="mt-2 flex gap-2">
            <Input
              type="number"
              min={0}
              placeholder="Neues Budget"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="h-9 text-sm"
            />
            <Button
              size="sm"
              disabled={busy != null || budget === ""}
              onClick={() =>
                act(
                  "budget",
                  async () => {
                    await miniAppWrite("reward-budget", "PATCH", {
                      id: app.id,
                      budget: Number(budget),
                    });
                    setBudget("");
                  },
                  `Budget auf ${nf.format(Number(budget))} RÖ gesetzt.`,
                )
              }
            >
              <Coins className="mr-1 h-4 w-4" /> Setzen
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Nicht freigegebene Apps haben Budget 0 → jede Belohnung wird abgelehnt.
          </p>
        </DetailCard>

        <DetailCard title="Steuerung">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Besitzer ändern (0x…)"
                value={ownerWallet}
                onChange={(e) => setOwnerWallet(e.target.value)}
                className="h-9 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy != null || !/^0x[0-9a-fA-F]{40}$/.test(ownerWallet.trim())}
                onClick={() =>
                  act(
                    "owner",
                    async () => {
                      await miniAppWrite("owner", "POST", { id: app.id, wallet: ownerWallet.trim() });
                      setOwnerWallet("");
                    },
                    "Besitzer geändert.",
                  )
                }
              >
                Besitzer ändern
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start"
              disabled={busy != null}
              onClick={() =>
                act(
                  "featured",
                  () => miniAppWrite(`${app.id}`, "PATCH", { featured: !app.featured }),
                  app.featured ? "Empfehlung entfernt." : "Als empfohlen markiert.",
                )
              }
            >
              <Star
                className={app.featured ? "mr-2 h-4 w-4 fill-amber-400 text-amber-400" : "mr-2 h-4 w-4"}
              />
              {app.featured ? "Empfehlung entfernen" : "Als empfohlen markieren"}
            </Button>
            {app.status === "live" ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start border-red-300 text-red-700 hover:bg-red-50"
                disabled={busy != null}
                onClick={() =>
                  act(
                    "suspend",
                    () => miniAppWrite(`${app.id}`, "PATCH", { status: "suspended" }),
                    `"${app.name}" gesperrt — sofort aus Store und Host entfernt.`,
                  )
                }
              >
                <Ban className="mr-2 h-4 w-4" /> Sperren (Kill-Switch)
              </Button>
            ) : app.status === "suspended" ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start"
                disabled={busy != null}
                onClick={() =>
                  act(
                    "unsuspend",
                    () => miniAppWrite(`${app.id}`, "PATCH", { status: "live" }),
                    `"${app.name}" wieder freigeschaltet.`,
                  )
                }
              >
                <Check className="mr-2 h-4 w-4" /> Wieder freischalten
              </Button>
            ) : null}
          </div>
        </DetailCard>
      </div>

      {/* Manifest / metadata — admin edits apply immediately (no re-review) */}
      {editingManifest ? (
        <DetailCard title="Manifest bearbeiten">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Admin-Änderungen gehen sofort live — die App bleibt im aktuellen Status.
              Icon und Vorschaubilder verwaltest du im Bereich „Bilder“ darunter.
            </p>
            <Button size="sm" variant="ghost" onClick={() => setEditingManifest(false)}>
              Abbrechen
            </Button>
          </div>
          <ManifestForm
            app={app}
            submitLabel="Speichern (sofort live)"
            busy={busy === "manifest"}
            hideImageFields
            onSubmit={(manifest) =>
              act(
                "manifest",
                async () => {
                  await miniAppWrite(`${app.id}`, "PATCH", { manifest });
                  setEditingManifest(false);
                },
                "Manifest gespeichert.",
              )
            }
          />
        </DetailCard>
      ) : (
      <DetailCard title="Manifest">
        <div className="mb-2 flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setEditingManifest(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Bearbeiten
          </Button>
        </div>
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
            <InfoRow label="Tags">{app.tags.length ? app.tags.join(", ") : "–"}</InfoRow>
            <InfoRow label="Quelle">{app.source}</InfoRow>
            <InfoRow label="Aktualisiert">{timeAgo(Date.parse(app.updated_at))}</InfoRow>
          </div>
        </div>
        <MiniAppPreviewRow images={app.screenshots} className="mt-3" />
      </DetailCard>
      )}

      {/* Icon + Store-Artwork + Store-Vorschau (Admin verwaltet via Session) */}
      <ImagesSection app={app} wallet={null} onChanged={refresh} />

      {/* Inhalte (Mini-CMS) — live editierbar ohne Republish */}
      <ContentSection app={app} wallet={null} />

      {/* Broadcast an alle Nutzer:innen mit aktivierten Benachrichtigungen */}
      <NotificationsSection app={app} wallet={null} />

      {/* Playground — single-file apps render their stored HTML directly, so the
          preview works for pending AND rejected apps (home_url tombstones 410). */}
      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-tight">Playground</h2>
        <Playground
          app={app}
          html={data?.versions?.find((v) => typeof v.html === "string" && v.html)?.html ?? null}
        />
      </div>

      {/* Per-app analytics */}
      <AnalyticsPanel appId={app.id} />
    </div>
  );
}
