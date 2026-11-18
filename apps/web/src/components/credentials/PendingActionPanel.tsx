"use client";

import { useEffect, useState } from "react";
import { Smartphone, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { useCredentials } from "./CredentialsContext";
import { credentialsRequest, isPendingStatus, pollAction, safeActionError, type ActionView } from "@/lib/credentials/client";

export function statusLabel(a: Pick<ActionView, "status" | "error">): string {
  switch (a.status) {
    case "awaiting_confirmation":
      return "Wartet";
    case "submitted":
      return "Wird eingetragen";
    case "done":
      return "Erledigt";
    case "failed":
      return `Fehlgeschlagen: ${safeActionError(a.error)}`;
    case "cancelled":
      return "Verworfen";
    case "expired":
      return "Abgelaufen";
  }
}

/**
 * Shown after every prepare: the summary the phone will show, a live status (polled every 5 s)
 * and "Verwerfen" while the action still waits for the phone.
 */
export function PendingActionPanel({ action, onSettled, onClose }: { action: ActionView; onSettled?: (a: ActionView) => void; onClose?: () => void }) {
  const { account } = useCredentials();
  const [view, setView] = useState<ActionView>(action);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setView(action);
    if (!isPendingStatus(action.status)) return;
    const ctl = new AbortController();
    pollAction(account, action.id, (a) => setView(a), { signal: ctl.signal })
      .then((a) => onSettled?.(a))
      .catch(() => {
        /* aborted or the action is gone */
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.id]);

  async function discard() {
    setBusy(true);
    setErr(null);
    const r = await credentialsRequest<null>(account, "actions", "action_cancel", { actionId: view.id });
    setBusy(false);
    if (r.ok) setView({ ...view, status: "cancelled" });
    else setErr(r.message);
  }

  const pending = isPendingStatus(view.status);
  const icon =
    view.status === "done" ? (
      <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />
    ) : view.status === "failed" || view.status === "cancelled" ? (
      <XCircle className="h-5 w-5 text-red-600" aria-hidden />
    ) : view.status === "expired" ? (
      <Clock className="h-5 w-5 text-[#6B7280]" aria-hidden />
    ) : view.status === "submitted" ? (
      <Loader2 className="h-5 w-5 animate-spin text-[#00498B]" aria-hidden />
    ) : (
      <Smartphone className="h-5 w-5 text-[#00498B]" aria-hidden />
    );

  return (
    <div className="rounded-lg border border-[#B4B8C1] bg-card p-4" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">
          {view.status === "awaiting_confirmation" && (
            <p className="text-sm font-semibold text-[#00498B]">Bestätige jetzt in der Röbel App auf deinem Handy</p>
          )}
          <p className="text-sm font-medium text-foreground">{view.summary.title}</p>
          {view.summary.lines.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-sm text-[#6B7280]">
              {view.summary.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs font-medium text-foreground">Status: {statusLabel(view)}</p>
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {view.status === "awaiting_confirmation" && (
            <button
              type="button"
              onClick={discard}
              disabled={busy}
              className="rounded-md border border-[#B4B8C1] px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Verwerfen
            </button>
          )}
          {!pending && onClose && (
            <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-xs font-medium text-[#00498B] hover:underline">
              Schließen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A prepare result's actionId as the panel's first view (before the first poll). */
export function freshAction(actionId: string, title: string, lines: string[] = []): ActionView {
  return { id: actionId, status: "awaiting_confirmation", summary: { title, lines, orgName: null }, expiresAt: "", error: null };
}
