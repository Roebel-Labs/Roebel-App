"use client";
import { useState } from "react";
import { Loader2, CheckCircle2, XCircle, ExternalLink, ChevronDown } from "lucide-react";
import type { ActionState } from "../useTxAction";

/** Renders the staged progress / success / friendly-error states of useTxAction. */
export function ActionFeedback({ state, onRetry }: { state: ActionState; onRetry?: () => void }) {
  const [showDetail, setShowDetail] = useState(false);
  if (state.phase === "idle") return null;

  if (state.phase === "running") {
    return (
      <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm">
        <ol className="space-y-1.5">
          {state.steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              {i < state.step ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : i === state.step ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-sky-200" />
              )}
              <span className={i <= state.step ? "text-foreground" : "text-muted-foreground"}>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (state.phase === "success") {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p>{state.message}</p>
          {state.txHash && (
            <a
              className="mt-1 inline-flex items-center gap-1 text-xs underline"
              href={`https://gnosisscan.io/tx/${state.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Auf Gnosisscan ansehen <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <div className="flex items-start gap-2">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p>{state.error.message}</p>
          <div className="mt-1.5 flex items-center gap-3 text-xs">
            {onRetry && (
              <button onClick={onRetry} className="font-medium underline">
                Erneut versuchen
              </button>
            )}
            <button
              onClick={() => setShowDetail((s) => !s)}
              className="inline-flex items-center gap-1 text-red-600/80"
            >
              Technische Details
              <ChevronDown className={`h-3 w-3 transition-transform ${showDetail ? "rotate-180" : ""}`} />
            </button>
          </div>
          {showDetail && (
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-red-100 p-2 text-[11px] text-red-900/80">
              {state.error.detail}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
