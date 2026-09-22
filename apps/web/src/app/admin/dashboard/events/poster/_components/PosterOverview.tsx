"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AFrame } from "@/components/poster/AFrame";
import { classifyRatio, RATIO_LABELS, type RatioClass } from "@/lib/poster/ratio";
import {
  listPosterOverviewAction,
  proposeForEventAction,
  type PosterOverviewEvent,
} from "@/app/actions/poster-proposals";

type State = "applied" | "kept" | "ready" | "fine" | "open";

function stateOf(e: PosterOverviewEvent): State {
  if (e.poster_proposal_id) return "applied";
  if (e.openBatch) return "ready";
  if (e.poster_reviewed_at) return "kept";
  if (e.poster_check?.mode === "skip") return "fine";
  return "open";
}

const STATE_LABEL: Record<State, string> = {
  applied: "Übernommen",
  kept: "Original behalten",
  ready: "Vorschläge bereit",
  fine: "Plakat passt",
  open: "Offen",
};

function ratioChip(ratio: RatioClass | null) {
  if (!ratio) return <Badge variant="outline" className="text-xs">nicht gemessen</Badge>;
  return (
    <Badge variant={ratio === "ok" ? "secondary" : "destructive"} className="text-xs">
      {RATIO_LABELS[ratio]}
    </Badge>
  );
}

export function PosterOverview() {
  const [events, setEvents] = useState<PosterOverviewEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [spent, setSpent] = useState(0);
  const [budget, setBudget] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [measured, setMeasured] = useState<Record<string, RatioClass>>({});
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<{ total: number; done: number } | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    const res = await listPosterOverviewAction();
    if (!res.success) {
      toast.error(res.error);
      setLoading(false);
      return;
    }
    setEvents(res.events);
    setSpent(res.spentTodayUsd);
    setBudget(res.budgetLimitUsd);
    setEnabled(res.enabled);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const ratioFor = useCallback(
    (e: PosterOverviewEvent): RatioClass | null => e.poster_check?.ratio ?? measured[e.id] ?? null,
    [measured],
  );

  const counts = useMemo(() => {
    const c = { fine: 0, needs: 0, ready: 0, applied: 0 };
    for (const e of events) {
      const s = stateOf(e);
      if (s === "applied") c.applied++;
      else if (s === "ready") c.ready++;
      else if (s === "fine" || (s === "open" && !e.poster_check && ratioFor(e) === "ok")) c.fine++;
      else c.needs++;
    }
    return c;
  }, [events, ratioFor]);

  const proposeOne = async (eventId: string, force = false) => {
    setRunning((s) => new Set(s).add(eventId));
    const res = await proposeForEventAction(eventId, { force });
    setRunning((s) => {
      const n = new Set(s);
      n.delete(eventId);
      return n;
    });
    if (!res.success) {
      toast.error(res.error);
      return false;
    }
    if ("skipped" in res.result) toast.message("Plakat passt bereits, nichts erzeugt.");
    else toast.success(`Zwei Vorschläge erzeugt (${res.result.costUsd.toFixed(2)} $)`);
    await load();
    return true;
  };

  const runBatch = async () => {
    const queue = events.filter((e) => stateOf(e) === "open").map((e) => e.id);
    if (queue.length === 0) {
      toast.message("Keine offenen Veranstaltungen.");
      return;
    }
    stopRef.current = false;
    setBatch({ total: queue.length, done: 0 });
    const workers = Array.from({ length: 2 }, async () => {
      while (queue.length > 0 && !stopRef.current) {
        const id = queue.shift();
        if (!id) break;
        await proposeOne(id);
        setBatch((b) => (b ? { ...b, done: b.done + 1 } : b));
      }
    });
    await Promise.all(workers);
    setBatch(null);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Plakate</h1>
          <p className="text-sm text-muted-foreground">
            Anstehende Veranstaltungen und ihre Bilder im DIN-A-Hochformat der Explore-Rails.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Heute {spent.toFixed(2)} $ von {budget.toFixed(0)} $ Budget
          </span>
          {batch ? (
            <Button variant="outline" size="sm" onClick={() => (stopRef.current = true)}>
              Stopp ({batch.done}/{batch.total})
            </Button>
          ) : (
            <Button size="sm" onClick={runBatch} disabled={!enabled}>
              Alle offenen erzeugen
            </Button>
          )}
        </div>
      </div>

      {!enabled ? (
        <p className="rounded-[8px] border border-border bg-muted p-3 text-sm">
          Plakat-Vorschläge sind über app_settings deaktiviert.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Plakat passt", counts.fine],
            ["Braucht Plakat", counts.needs],
            ["Vorschläge bereit", counts.ready],
            ["Übernommen", counts.applied],
          ] as Array<[string, number]>
        ).map(([label, n]) => (
          <div key={label} className="rounded-[8px] border border-border bg-card p-3">
            <div className="text-2xl font-semibold tabular-nums">{n}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {events.map((e) => {
          const state = stateOf(e);
          const busy = running.has(e.id);
          return (
            <div key={e.id} className="flex gap-4 rounded-[10px] border border-border bg-card p-3">
              <div className="w-20 shrink-0">
                <AFrame src={e.image_url} alt={e.title} fit="cover" />
                {e.image_url && !e.poster_check?.ratio && !measured[e.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.image_url}
                    alt=""
                    className="hidden"
                    onLoad={(ev) => {
                      const img = ev.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        setMeasured((m) => ({ ...m, [e.id]: classifyRatio(img.naturalWidth, img.naturalHeight) }));
                      }
                    }}
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-medium">{e.title}</h3>
                  {ratioChip(ratioFor(e))}
                  <Badge variant="outline" className="text-xs">{STATE_LABEL[state]}</Badge>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {e.date} · {e.status}
                  {e.poster_check?.width ? ` · ${e.poster_check.width} × ${e.poster_check.height} px` : ""}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {state === "ready" || state === "applied" || state === "kept" ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/dashboard/events/poster/${e.id}`}>Prüfen</Link>
                    </Button>
                  ) : null}
                  {state === "open" || state === "fine" || state === "kept" ? (
                    <Button size="sm" disabled={busy || !enabled} onClick={() => proposeOne(e.id, state === "fine")}>
                      {busy ? "Erzeuge…" : state === "fine" ? "Trotzdem vorschlagen" : "Vorschläge erzeugen"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
