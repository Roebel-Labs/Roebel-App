"use client";

// Inbox for the mini-app dashboard: a guided next-steps checklist that walks
// the developer from draft to a fully published, polished mini app. Tasks are
// DERIVED from the app's state (no manual bookkeeping) — done tasks move to
// the "Erledigt" tab automatically.
import Link from "next/link";
import {
  Bell,
  FileText,
  Image as ImageIcon,
  Images,
  Rocket,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MiniAppRow } from "@/lib/miniapp/types";
import type { SettingsSection } from "./SettingsDialog";
import { useState } from "react";

export type InboxTask = {
  key: string;
  title: string;
  text: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
  /** where the CTA leads: a settings section or an external href */
  action?: { section: SettingsSection } | { href: string };
  cta?: string;
};

/** Derives the guided checklist for the selected app (exported for the badge). */
export function deriveTasks(app: MiniAppRow | null): InboxTask[] {
  if (!app) {
    return [
      {
        key: "create",
        title: "Erste Mini-App erstellen",
        text: "Beschreibe deine Idee im KI-Baukasten — in ein paar Minuten läuft deine erste App.",
        icon: Sparkles,
        done: false,
        action: { href: "/editor" },
        cta: "Mit KI erstellen",
      },
    ];
  }
  const publishTask: InboxTask =
    app.status === "live"
      ? {
          key: "publish",
          title: "App veröffentlicht",
          text: "Deine App ist live in der Röbel App.",
          icon: Rocket,
          done: true,
        }
      : app.status === "pending"
        ? {
            key: "publish",
            title: "App in Prüfung",
            text: "Ein Admin testet deine App im Playground und schaltet sie frei — du musst nichts tun.",
            icon: Rocket,
            done: false,
          }
        : {
            key: "publish",
            title: "App veröffentlichen",
            text:
              app.source === "ai_builder"
                ? "Veröffentliche deine App aus dem KI-Baukasten — danach prüft ein Admin und schaltet sie live."
                : "Reiche deine App zur Prüfung ein — danach schaltet ein Admin sie live.",
            icon: Rocket,
            done: false,
            action:
              app.source === "ai_builder"
                ? { href: `/editor?app=${app.slug}` }
                : { section: "app" },
            cta: app.source === "ai_builder" ? "Im KI-Baukasten öffnen" : "Zu den App-Infos",
          };

  return [
    publishTask,
    {
      key: "icon",
      title: "App-Icon hochladen",
      text: "Ein eigenes Icon macht deine App im Store erkennbar — hochladen oder mit KI generieren.",
      icon: ImageIcon,
      done: !!app.icon_url,
      action: { section: "images" },
      cta: "Zu den Bildern",
    },
    {
      key: "screenshots",
      title: "Screenshots hinzufügen",
      text: "Vorschau-Bilder zeigen im Store, was deine App kann.",
      icon: Images,
      done: (app.screenshots ?? []).length > 0,
      action: { section: "images" },
      cta: "Zu den Bildern",
    },
    {
      key: "description",
      title: "Beschreibung vervollständigen",
      text: "Eine gute Beschreibung (mindestens ein Satz) hilft Nutzern und der Prüfung.",
      icon: FileText,
      done: (app.description ?? "").trim().length >= 20,
      action: { section: "app" },
      cta: "Beschreibung bearbeiten",
    },
    {
      key: "notifications",
      title: "Benachrichtigungen einrichten",
      text: "Erreiche deine Nutzer mit Push-Benachrichtigungen aus deiner App.",
      icon: Bell,
      done: false,
      action: { section: "notifications" },
      cta: "Einrichten",
    },
  ];
}

export function InboxDialog({
  app,
  onClose,
  onOpenSettings,
}: {
  app: MiniAppRow | null;
  onClose: () => void;
  onOpenSettings: (s: SettingsSection) => void;
}) {
  const [tab, setTab] = useState<"open" | "done">("open");
  const tasks = deriveTasks(app);
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const shown = tab === "open" ? open : done;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label="Inbox">
      <button
        type="button"
        aria-label="Inbox schließen"
        onClick={onClose}
        className="absolute inset-0"
      />
      <div className="absolute right-4 top-16 flex max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 pt-3">
          <div className="flex gap-4">
            {(
              [
                { key: "open", label: "Offen", count: open.length },
                { key: "done", label: "Erledigt", count: done.length },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="mb-2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {shown.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              {tab === "open"
                ? "Alles erledigt — deine App ist startklar! 🎉"
                : "Noch nichts erledigt — leg los!"}
            </p>
          ) : (
            <div className="space-y-1">
              {shown.map((t) => {
                const Icon = t.icon;
                return (
                  <div key={t.key} className="flex gap-3 rounded-xl p-3 hover:bg-accent/50">
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        t.done ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{t.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {t.text}
                      </p>
                      {!t.done && t.action && t.cta ? (
                        <div className="mt-2">
                          {"href" in t.action ? (
                            <Link href={t.action.href}>
                              <Button size="sm" variant="outline" className="h-7 text-xs">
                                {t.cta}
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                if (t.action && "section" in t.action) {
                                  onOpenSettings(t.action.section);
                                }
                                onClose();
                              }}
                            >
                              {t.cta}
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
