"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AFrame } from "@/components/poster/AFrame";
import { PosterLightbox } from "@/components/poster/PosterLightbox";
import { PosterProposalPair, DIRECTION_LABELS } from "@/components/poster/PosterProposalPair";
import { RATIO_LABELS } from "@/lib/poster/ratio";
import type { PosterProposal } from "@/lib/poster/types";
import {
  getPosterReviewAction,
  keepOriginalAction,
  proposeForEventAction,
  selectPosterAction,
  type PosterReviewEvent,
} from "@/app/actions/poster-proposals";

export function PosterReview({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<PosterReviewEvent | null>(null);
  const [proposals, setProposals] = useState<PosterProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [originalOpen, setOriginalOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await getPosterReviewAction(eventId);
    if (!res.success) {
      toast.error(res.error);
      setLoading(false);
      return;
    }
    setEvent(res.event);
    setProposals(res.proposals);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !event) return <Skeleton className="h-64 w-full" />;

  const latestBatchId = proposals[0]?.batch_id ?? null;
  const latest = proposals.filter((p) => p.batch_id === latestBatchId);
  const older = proposals.filter((p) => p.batch_id !== latestBatchId);
  const original = event.original_image_url ?? event.image_url;
  const check = event.poster_check;

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const generate = (hint?: string) =>
    withBusy(async () => {
      const res = await proposeForEventAction(eventId, { hint, force: true });
      if (!res.success) toast.error(res.error);
      else if ("skipped" in res.result) toast.message("Nichts erzeugt.");
      else toast.success(`Zwei Vorschläge erzeugt (${res.result.costUsd.toFixed(2)} $)`);
      await load();
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/dashboard/events/poster">
            <ArrowLeft className="mr-1 h-4 w-4" /> Plakate
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <p className="text-sm text-muted-foreground">
          {event.date}
          {event.time ? ` · ${event.time.slice(0, 5)} Uhr` : ""}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {check?.ratio ? (
            <Badge variant={check.ratio === "ok" ? "secondary" : "destructive"}>{RATIO_LABELS[check.ratio]}</Badge>
          ) : null}
          {check?.analysis ? (
            <Badge variant="outline">
              {check.analysis.kind}
              {check.analysis.hasEventInfo ? " · mit Infos" : " · ohne Infos"}
            </Badge>
          ) : null}
          {check?.mode ? <Badge variant="outline">{check.mode === "skip" ? "passt" : check.mode}</Badge> : null}
          {event.poster_proposal_id ? <Badge>Vorschlag übernommen</Badge> : null}
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Original</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <div className="overflow-hidden rounded-[8px] border border-border bg-muted">
              {original ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={original} alt="Original" className="w-full cursor-zoom-in" onClick={() => setOriginalOpen(0)} />
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              Hochgeladen{check?.width ? ` · ${check.width} × ${check.height} px` : ""}
            </div>
          </div>
          <div className="space-y-1">
            <AFrame src={original} alt="So sieht es in der App aus" fit="cover" onClick={() => setOriginalOpen(0)} />
            <div className="text-xs text-muted-foreground">In der App heute (A-Box, cover)</div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Vorschläge</h2>
          {latest.length === 0 ? (
            <Button size="sm" disabled={busy} onClick={() => generate()}>
              {busy ? "Erzeuge…" : "Vorschläge erzeugen"}
            </Button>
          ) : null}
        </div>
        {latest.length > 0 ? (
          <PosterProposalPair
            proposals={latest}
            fileBase={event.title}
            selectedId={event.poster_proposal_id}
            busy={busy}
            onSelect={(p) =>
              withBusy(async () => {
                const res = await selectPosterAction(p.id);
                if (!res.success) toast.error(res.error ?? "Fehler");
                else toast.success(`Variante ${DIRECTION_LABELS[p.direction] ?? p.direction} übernommen`);
                await load();
              })
            }
            onKeepOriginal={() =>
              withBusy(async () => {
                const res = await keepOriginalAction(eventId);
                if (!res.success) toast.error(res.error ?? "Fehler");
                else toast.success("Original behalten");
                await load();
              })
            }
            onRegenerate={(hint) => generate(hint)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Noch keine Vorschläge für diese Veranstaltung.</p>
        )}
      </section>

      {older.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Frühere Runden</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {older.map((p) => (
              <div key={p.id} className="space-y-1">
                <AFrame
                  src={p.image_url}
                  alt={p.direction}
                  fit="cover"
                  className={p.status === "selected" ? "ring-2 ring-primary" : ""}
                />
                <div className="truncate text-[11px] text-muted-foreground">
                  {DIRECTION_LABELS[p.direction] ?? p.direction} · {p.status}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <PosterLightbox
        images={original ? [{ url: original, label: "Original" }] : []}
        index={originalOpen}
        onClose={() => setOriginalOpen(null)}
        onIndexChange={setOriginalOpen}
      />
    </div>
  );
}
