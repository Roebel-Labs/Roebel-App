"use client";

// Settings dialog for the mini-app dashboard — everything that is not a data
// chart or the Build-with-AI CTA lives here: App-Informationen (manifest),
// Bilder, Inhalte, Benachrichtigungen, API & MCP, Import und Build-Tools.
// Layout mirrors the reference: left nav groups, content pane, X to close.
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Blocks,
  Copy,
  FileText,
  Image as ImageIcon,
  Info,
  KeyRound,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { miniAppWrite } from "@/components/mini-apps/client";
import { ManifestForm } from "@/components/mini-apps/ManifestForm";
import { ImagesSection } from "@/components/mini-apps/ImagesSection";
import { ContentSection } from "@/components/mini-apps/ContentSection";
import { NotificationsSection } from "@/components/mini-apps/NotificationsSection";
import { BuildOptions } from "@/components/mini-apps/BuildOptions";
import { StatusBadge } from "@/components/mini-apps/ui";
import { MCP_SNIPPET } from "@/lib/miniapp/buildSnippets";
import type { MiniAppManifest, MiniAppRow } from "@/lib/miniapp/types";

export type SettingsSection =
  | "app"
  | "images"
  | "content"
  | "notifications"
  | "api"
  | "import"
  | "tools";

const NAV: {
  group: string;
  items: { key: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[];
}[] = [
  {
    group: "App",
    items: [
      { key: "app", label: "App-Informationen", icon: Info },
      { key: "images", label: "Bilder", icon: ImageIcon },
      { key: "content", label: "Inhalte", icon: FileText },
      { key: "notifications", label: "Benachrichtigungen", icon: Bell },
    ],
  },
  {
    group: "Entwickler",
    items: [
      { key: "api", label: "API & MCP", icon: KeyRound },
      { key: "tools", label: "Eigene Tools", icon: Blocks },
      { key: "import", label: "App importieren", icon: Upload },
    ],
  },
];

const TITLES: Record<SettingsSection, string> = {
  app: "App-Informationen",
  images: "Bilder",
  content: "Inhalte",
  notifications: "Benachrichtigungen",
  api: "API & MCP",
  tools: "Eigene Tools",
  import: "App importieren",
};

export function SettingsDialog({
  app,
  wallet,
  section,
  onSectionChange,
  onClose,
  onChanged,
}: {
  app: MiniAppRow | null;
  wallet: string | null;
  section: SettingsSection;
  onSectionChange: (s: SettingsSection) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveManifest(manifest: MiniAppManifest) {
    if (!wallet || !app) return;
    setBusy(true);
    setSaveError(null);
    try {
      await miniAppWrite(`${app.id}`, "PATCH", { manifest, wallet }, wallet);
      onChanged();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const needsApp = section === "app" || section === "images" || section === "content" || section === "notifications";

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Einstellungen"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />
      <div className="relative flex h-[min(680px,90vh)] w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Left nav */}
        <div className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-muted/30 p-4 sm:flex">
          {NAV.map(({ group, items }) => (
            <div key={group} className="mb-5">
              <p className="mb-1.5 px-2 text-xs font-medium text-muted-foreground">{group}</p>
              <div className="space-y-0.5">
                {items.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSectionChange(key)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      section === key
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Content pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-base font-semibold">{TITLES[section]}</h2>
            <button
              type="button"
              aria-label="Einstellungen schließen"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile section switcher */}
          <div className="border-b border-border px-4 py-2 sm:hidden">
            <select
              value={section}
              onChange={(e) => onSectionChange(e.target.value as SettingsSection)}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              {NAV.flatMap((g) => g.items).map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {needsApp && !app ? (
              <p className="text-sm text-muted-foreground">
                Erstelle zuerst eine Mini-App — dann kannst du sie hier konfigurieren.
              </p>
            ) : null}

            {section === "app" && app ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <StatusBadge status={app.status} />
                  {app.source === "ai_builder" ? (
                    <Link href={`/editor?app=${app.slug}`} className="text-xs font-medium text-primary hover:underline">
                      Im KI-Baukasten bearbeiten →
                    </Link>
                  ) : null}
                </div>
                {app.status === "rejected" && app.review_notes ? (
                  <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <p className="font-medium">Abgelehnt</p>
                    <p className="mt-0.5">{app.review_notes}</p>
                  </div>
                ) : null}
                {saveError ? (
                  <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {saveError}
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Änderungen setzen die App zurück in die Prüfung.{" "}
                  <button
                    type="button"
                    onClick={() => onSectionChange("images")}
                    className="font-medium text-primary hover:underline"
                  >
                    Icon und Vorschaubilder verwaltest du unter „Bilder“
                  </button>{" "}
                  — dort auch mit KI-Generierung und -Bearbeitung.
                </p>
                <ManifestForm
                  app={app}
                  submitLabel="Speichern & erneut einreichen"
                  onSubmit={saveManifest}
                  busy={busy}
                  hideImageFields
                />
              </div>
            ) : null}

            {section === "images" && app && wallet ? (
              <ImagesSection app={app} wallet={wallet} onChanged={onChanged} />
            ) : null}

            {section === "content" && app && wallet ? (
              <ContentSection app={app} wallet={wallet} />
            ) : null}

            {section === "notifications" && app && wallet ? (
              <NotificationsSection app={app} wallet={wallet} />
            ) : null}

            {section === "api" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Verbinde Claude Code oder jeden MCP-fähigen Agenten mit deinem Konto —
                  Apps, die darüber eingereicht werden, erscheinen in deinem Dashboard.
                </p>
                <div className="rounded-[10px] border border-border bg-muted/50 p-3">
                  <pre className="overflow-x-auto font-mono text-xs leading-relaxed">{MCP_SNIPPET}</pre>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(MCP_SNIPPET);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" /> {copied ? "Kopiert" : "Snippet kopieren"}
                  </Button>
                  <Link href="/dashboard/mini-apps/api">
                    <Button size="sm">API-Keys verwalten</Button>
                  </Link>
                </div>
              </div>
            ) : null}

            {section === "tools" ? <BuildOptions className="" wallet={wallet} /> : null}

            {section === "import" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Bring eine bestehende App in die Röbel App: gehostete URL (Lovable,
                  Vercel, eigener Server) oder eine einzelne HTML-Datei — wir hosten sie
                  unter <span className="font-mono text-xs">&lt;slug&gt;.roebel.site</span>.
                </p>
                <Link href="/dashboard/mini-apps/import">
                  <Button size="sm">
                    <Upload className="mr-1 h-3.5 w-3.5" /> Zum Import
                  </Button>
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
