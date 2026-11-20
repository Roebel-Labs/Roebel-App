"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Users, Heart, Euro, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase, hasSupabase } from "@/lib/supabase";
import { useLiveShow } from "../use-live-show";
import { formatEuro, type LiveOverlay, type LiveShow, type LiveShowStatus } from "../types";
import { liveAdminSafe } from "./api";
import { useLiveChannelStats } from "./use-live-channel";
import { RundownPanel } from "./rundown-panel";
import { OverlayPanel } from "./overlay-panel";
import { ChatPanel, SupportPanel, useLiveChat } from "./chat-panel";
import { CloudflarePanel } from "./cloudflare-panel";
import { SettingsPanel } from "./settings-panel";
import { ReportsPanel } from "./reports-panel";

const STORAGE_KEY = "live-console-show";

type ShowListRow = Pick<LiveShow, "id" | "slug" | "title" | "status" | "starts_at">;

const STATUS_LABEL: Record<LiveShowStatus, string> = { scheduled: "Geplant", live: "LIVE", ended: "Beendet" };

export function LiveConsole() {
  const [shows, setShows] = useState<ShowListRow[] | null>(null);
  const [showId, setShowId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSupabase) {
      setShows([]);
      return;
    }
    supabase
      .from("live_shows")
      .select("id, slug, title, status, starts_at")
      .order("starts_at", { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (error) toast.error(`Übertragungen konnten nicht geladen werden: ${error.message}`);
        const list = (data ?? []) as ShowListRow[];
        setShows(list);
        const stored = window.localStorage.getItem(STORAGE_KEY);
        const pick = list.find((s) => s.id === stored) ?? list.find((s) => s.status === "live") ?? list[0];
        if (pick) setShowId(pick.id);
      });
  }, []);

  const select = (id: string) => {
    setShowId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Livestream</h1>
          <p className="text-sm text-muted-foreground">Regie für Übertragung, Einblendungen und Chat. Tastenkürzel: N = nächste Gruppe.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="live-show-picker" className="text-sm text-muted-foreground">
            Übertragung
          </label>
          <select
            id="live-show-picker"
            className="h-10 min-w-[260px] rounded-[10px] border border-input bg-background px-3 text-sm"
            value={showId ?? ""}
            onChange={(e) => select(e.target.value)}
            disabled={!shows || shows.length === 0}
          >
            {!shows && <option value="">Lädt …</option>}
            {shows?.length === 0 && <option value="">Keine Übertragung angelegt</option>}
            {shows?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({STATUS_LABEL[s.status] ?? s.status})
              </option>
            ))}
          </select>
        </div>
      </div>
      {showId ? <ShowConsole key={showId} showId={showId} /> : shows && shows.length === 0 ? <EmptyState /> : null}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        Noch keine Übertragung in <code>live_shows</code>. Die DanceCup-Übertragung wird per Migration angelegt.
      </CardContent>
    </Card>
  );
}

function ShowConsole({ showId }: { showId: string }) {
  const { show, items, loading, reload, setShow } = useLiveShow({ showId }, { pollMs: 30_000 });
  const { viewers, perMinute } = useLiveChannelStats(showId);
  const { messages, removeLocal, reload: reloadChat } = useLiveChat(showId);
  const [confirm, setConfirm] = useState<LiveShowStatus | null>(null);

  const patchShow = useCallback(
    (patch: Partial<LiveShow>) => setShow((s) => (s ? { ...s, ...patch } : s)),
    [setShow],
  );
  const patchOverlay = useCallback(
    (patch: Partial<LiveOverlay>) => setShow((s) => (s ? { ...s, overlay: { ...s.overlay, ...patch } } : s)),
    [setShow],
  );

  if (loading && !show) return <div className="p-8 text-center text-sm text-muted-foreground">Lädt …</div>;
  if (!show) return <EmptyState />;

  const supportTotal = messages.filter((m) => m.kind === "support").reduce((s, m) => s + (m.amount_cents ?? 0), 0);

  const setStatus = async (status: LiveShowStatus) => {
    const prev = show.status;
    patchShow({ status });
    const res = await liveAdminSafe<{ status: LiveShowStatus; replay_url: string | null }>(
      "set_status",
      show.id,
      { status },
      status === "live" ? "Ihr seid LIVE" : status === "ended" ? "Übertragung beendet" : "Status: Geplant",
    );
    if (!res) patchShow({ status: prev });
    else {
      if (status === "ended" && res.replay_url) toast.info("Aufzeichnung ist als Wiederholung hinterlegt.");
      reload();
    }
  };

  const requestStatus = (status: LiveShowStatus) => {
    if (status === show.status) return;
    if (status === "live" || status === "ended") setConfirm(status);
    else setStatus(status);
  };

  return (
    <div className="space-y-5">
      {/* Status bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex rounded-[12px] border border-border p-1">
            {(["scheduled", "live", "ended"] as LiveShowStatus[]).map((s) => {
              const active = show.status === s;
              const activeCls =
                s === "live" ? "bg-red-600 text-white hover:bg-red-600" : "bg-primary text-primary-foreground hover:bg-primary";
              return (
                <Button
                  key={s}
                  variant="ghost"
                  className={`h-12 min-w-[120px] text-base ${active ? activeCls : ""}`}
                  onClick={() => requestStatus(s)}
                >
                  {s === "live" && <span className={`mr-2 h-2.5 w-2.5 rounded-full ${active ? "bg-white animate-pulse" : "bg-red-600"}`} />}
                  {STATUS_LABEL[s]}
                </Button>
              );
            })}
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-6">
            <Stat icon={<Users className="h-5 w-5" />} label="Zuschauer in der App" value={String(viewers)} />
            <Stat icon={<Heart className="h-5 w-5" />} label="Reaktionen / Min." value={String(perMinute)} />
            <Stat icon={<Euro className="h-5 w-5" />} label="Unterstützt" value={formatEuro(supportTotal)} />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/live/${show.slug}`} target="_blank">
                <ExternalLink className="mr-1.5 h-4 w-4" /> Live-Seite
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <RundownPanel show={show} items={items} onChanged={reload} />
          <ChatPanel
            show={show}
            messages={messages}
            removeLocal={removeLocal}
            reload={reloadChat}
            onLocalShow={patchShow}
            onLocalOverlay={patchOverlay}
          />
        </div>
        <div className="space-y-5">
          <OverlayPanel show={show} onLocalPatch={patchOverlay} />
          <SupportPanel messages={messages} />
          <ReportsPanel show={show} />
          <CloudflarePanel show={show} onChanged={reload} />
          <SettingsPanel show={show} onChanged={reload} />
        </div>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "live" ? "Jetzt live gehen?" : "Übertragung beenden?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "live"
                ? "Die App zeigt die Übertragung ab sofort als LIVE an. Läuft OBS und sendet an Cloudflare?"
                : "Die App zeigt die Übertragung als beendet; die Aufzeichnung wird als Wiederholung hinterlegt. OBS danach stoppen."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className={confirm === "live" ? "bg-red-600 text-white hover:bg-red-700" : undefined}
              onClick={() => {
                if (confirm) setStatus(confirm);
                setConfirm(null);
              }}
            >
              {confirm === "live" ? "LIVE gehen" : "Beenden"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <div className="text-2xl font-bold leading-none tabular-nums text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
