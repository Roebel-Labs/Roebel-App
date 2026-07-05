"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, GitMerge, Trash2, Wand2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ACTIVE_FIX_STATUSES,
  type DevTicket,
  type DevTicketActivity,
} from "@/types/dev-tickets";
import { api } from "../_lib/client";
import { FixStatusChip } from "./fix-status-chip";
import { SOURCE_LABELS } from "./ticket-card";

type Detail = {
  ticket: DevTicket;
  activity: DevTicketActivity[];
  feedback: {
    subject?: string;
    message?: string;
    source?: string;
    device_info?: Record<string, unknown>;
  } | null;
};

type GithubInfo = {
  ticket: DevTicket;
  pr: {
    number: number;
    html_url: string;
    state: string;
    merged: boolean;
    mergeable_state: string;
  } | null;
  ci: "success" | "failure" | "pending" | "none" | null;
  canMerge: boolean;
};

const CI_LABELS: Record<string, string> = {
  success: "CI ✓ grün",
  failure: "CI ✗ rot",
  pending: "CI läuft…",
  none: "CI ausstehend",
};

const AUTHOR_LABELS: Record<string, string> = {
  admin: "Admin",
  ai: "KI",
  system: "System",
};

export function TicketDetailSheet({
  ticketId,
  onClose,
  onChanged,
}: {
  ticketId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [gh, setGh] = useState<GithubInfo | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const loadDetail = useCallback(async () => {
    if (!ticketId) return;
    const d = await api<Detail>(`/api/dev-tickets/${ticketId}`);
    setDetail(d);
    setTitle(d.ticket.title);
    setDescription(d.ticket.description);
  }, [ticketId]);

  useEffect(() => {
    setDetail(null);
    setGh(null);
    setComment("");
    if (ticketId) loadDetail().catch((e) => toast.error(String(e)));
  }, [ticketId, loadDetail]);

  // Poll GitHub state every 15s while the sheet is open and a fix is active.
  const fixStatus = detail?.ticket.fix_status;
  useEffect(() => {
    if (!ticketId || !fixStatus || !ACTIVE_FIX_STATUSES.includes(fixStatus))
      return;
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await api<GithubInfo>(`/api/dev-tickets/${ticketId}/github`);
        if (cancelled) return;
        setGh(res);
        if (res.ticket.fix_status !== fixStatus) {
          await loadDetail();
          onChanged();
        }
      } catch {
        /* GitHub hiccups are non-fatal for the sheet */
      }
    };
    sync();
    const iv = setInterval(sync, 15_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [ticketId, fixStatus, loadDetail, onChanged]);

  async function patch(fields: Record<string, unknown>, success?: string) {
    if (!ticketId) return;
    try {
      await api(`/api/dev-tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      if (success) toast.success(success);
      await loadDetail();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function action(
    key: string,
    path: string,
    successMsg: string,
    method = "POST"
  ) {
    if (!ticketId) return;
    setBusy(key);
    try {
      await api(`/api/dev-tickets/${ticketId}${path}`, { method });
      toast.success(successMsg);
      await loadDetail();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function addComment() {
    if (!ticketId || !comment.trim()) return;
    setBusy("comment");
    try {
      await api(`/api/dev-tickets/${ticketId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: comment }),
      });
      setComment("");
      await loadDetail();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!ticketId) return;
    if (!window.confirm("Ticket endgültig löschen?")) return;
    setBusy("delete");
    try {
      await api(`/api/dev-tickets/${ticketId}`, { method: "DELETE" });
      toast.success("Ticket gelöscht");
      onClose();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const t = detail?.ticket;
  const analysis = t?.ai_analysis;
  const canStartFix =
    !!t &&
    !["done", "rejected"].includes(t.status) &&
    ["none", "failed"].includes(t.fix_status);

  return (
    <Sheet open={!!ticketId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {!detail || !t ? (
          <p className="mt-8 text-sm text-muted-foreground">Lade Ticket…</p>
        ) : (
          <div className="space-y-6 pb-8">
            <SheetHeader>
              <SheetTitle className="sr-only">{t.title}</SheetTitle>
            </SheetHeader>

            {/* Title + meta */}
            <div className="space-y-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() =>
                  title.trim() && title !== t.title && patch({ title })
                }
                className="text-base font-semibold"
              />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select
                  value={t.type}
                  onChange={(e) => patch({ type: e.target.value })}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="bug">Bug</option>
                  <option value="feature">Feature</option>
                  <option value="task">Aufgabe</option>
                  <option value="improvement">Verbesserung</option>
                </select>
                <select
                  value={t.priority}
                  onChange={(e) => patch({ priority: e.target.value })}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="low">Niedrig</option>
                  <option value="medium">Mittel</option>
                  <option value="high">Hoch</option>
                  <option value="urgent">Dringend</option>
                </select>
                <span className="text-xs text-muted-foreground">
                  {SOURCE_LABELS[t.source]}
                </span>
                <FixStatusChip ticket={t} />
              </div>
            </div>

            {/* Actions: Gate 1 (fix) + Gate 2 (merge) */}
            <div className="flex flex-wrap gap-2">
              {canStartFix && (
                <Button
                  size="sm"
                  onClick={() =>
                    action("fix", "/fix", "KI-Fix gestartet — PR folgt")
                  }
                  disabled={busy === "fix"}
                >
                  <Wand2 className="mr-1.5 h-4 w-4" />
                  {t.fix_status === "failed"
                    ? "Fix erneut versuchen"
                    : "Fix mit KI"}
                </Button>
              )}
              {t.github_pr_url && (
                <Button size="sm" variant="outline" asChild>
                  <a href={t.github_pr_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-4 w-4" />
                    PR #{t.github_pr_number} ansehen
                  </a>
                </Button>
              )}
              {t.fix_status === "pr_open" && (
                <Button
                  size="sm"
                  variant={gh?.canMerge ? "default" : "outline"}
                  disabled={!gh?.canMerge || busy === "merge"}
                  onClick={() => {
                    if (
                      window.confirm(
                        `PR #${t.github_pr_number} wirklich in main mergen?`
                      )
                    )
                      action("merge", "/merge", "PR gemergt — Ticket fertig");
                  }}
                >
                  <GitMerge className="mr-1.5 h-4 w-4" />
                  {gh?.canMerge
                    ? "Mergen"
                    : gh
                      ? `Mergen (${CI_LABELS[gh.ci ?? "none"]})`
                      : "Mergen (prüfe…)"}
                </Button>
              )}
              {!["done", "rejected"].includes(t.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => patch({ status: "rejected" }, "Abgelehnt")}
                >
                  <XCircle className="mr-1.5 h-4 w-4" /> Ablehnen
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={remove}
                disabled={busy === "delete"}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Löschen
              </Button>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <h4 className="text-sm font-semibold">Beschreibung</h4>
              <Textarea
                rows={8}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() =>
                  description !== t.description && patch({ description })
                }
              />
            </div>

            {/* AI analysis */}
            {analysis && (
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                <h4 className="text-sm font-semibold">KI-Analyse</h4>
                {analysis.suspected_area && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Bereich:</span>{" "}
                    {analysis.suspected_area}
                  </p>
                )}
                {!!analysis.repro_steps?.length && (
                  <div className="text-sm">
                    <p className="text-muted-foreground">Reproduktion:</p>
                    <ol className="ml-4 list-decimal">
                      {analysis.repro_steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {analysis.severity_rationale && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Schweregrad:</span>{" "}
                    {analysis.severity_rationale}
                  </p>
                )}
              </div>
            )}

            {/* Source feedback */}
            {detail.feedback && (
              <div className="space-y-1.5 rounded-lg border p-3">
                <h4 className="text-sm font-semibold">Ursprüngliches Feedback</h4>
                <p className="text-sm font-medium">{detail.feedback.subject}</p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {detail.feedback.message}
                </p>
                {detail.feedback.device_info && (
                  <p className="text-xs text-muted-foreground">
                    Gerät: {JSON.stringify(detail.feedback.device_info)}
                  </p>
                )}
              </div>
            )}

            {/* Activity + comments */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Aktivität</h4>
              <div className="space-y-2">
                {detail.activity.map((a) => (
                  <div key={a.id} className="rounded-md bg-muted/40 p-2 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {AUTHOR_LABELS[a.author]} ·{" "}
                      {new Date(a.created_at).toLocaleString("de-DE")}
                    </p>
                    <p className="whitespace-pre-wrap">{a.body}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Kommentar hinzufügen…"
                  onKeyDown={(e) => e.key === "Enter" && addComment()}
                />
                <Button
                  size="sm"
                  onClick={addComment}
                  disabled={busy === "comment" || !comment.trim()}
                >
                  Senden
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
