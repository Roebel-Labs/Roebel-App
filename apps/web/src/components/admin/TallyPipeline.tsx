"use client";

/**
 * Live pipeline stepper for a Shamir tally session.
 *
 * Renders the seven stages a tally goes through after voting closes:
 *
 *   Anteile (n/k) → Rekonstruktion → Merge → ZK-Beweise → On-Chain → Ergebnisse → Fertig
 *
 * Stage data comes from Fly's /status → currentStage (written by the
 * reconstructor as it advances). The component degrades gracefully when
 * fine-grained stage info is missing (older coordinator build, or the
 * stage file belongs to a previous session): it then infers a coarse
 * stage from the session row alone — awaiting shares / running /
 * completed / aborted.
 */

import { Badge } from "@/components/ui/badge";

export type CurrentStage = {
  sessionId: string;
  pollId: string;
  stage: string;
  updatedAt: string;
} | null;

type SessionLike = {
  id: string;
  state: "open" | "completed" | "expired" | "aborted";
  submitted_shares_count: number;
};

const PIPELINE: { key: string; label: string; detail: string }[] = [
  {
    key: "awaiting-shares",
    label: "Anteile sammeln",
    detail: "Bescheiniger entschlüsseln + senden ihre Shamir-Anteile",
  },
  {
    key: "reconstructing",
    label: "Schlüssel rekonstruieren",
    detail: "3 Anteile → Coordinator-Privkey (nur im RAM)",
  },
  {
    key: "merging",
    label: "Merkle-Bäume mergen",
    detail: "Signups + Nachrichten on-chain festschreiben (~30 s)",
  },
  {
    key: "generating-proofs",
    label: "ZK-Beweise generieren",
    detail: "Der lange Schritt — ca. 10 Minuten",
  },
  {
    key: "submitting-proofs",
    label: "Beweise einreichen",
    detail: "proveOnChain: Verifier prüft jede Batch on-chain",
  },
  {
    key: "uploading-results",
    label: "Ergebnisse hochladen",
    detail: "addTallyResults schreibt die Auszählung in den Tally-Vertrag",
  },
  {
    key: "verifying",
    label: "Verifizieren",
    detail: "Lokale Gegenprüfung der on-chain Commitments",
  },
];

/** Map a stage key to its index in the pipeline; -1 if unknown. */
function stageIndex(stage: string): number {
  return PIPELINE.findIndex((s) => s.key === stage);
}

/**
 * Compact one-line label for a session's current pipeline position —
 * used by the coordinator overview's session list. Returns null when
 * there is nothing more informative to say than the session state.
 */
export function stageLabel(
  stage: string | null,
  sharesIn: number,
  threshold: number
): string | null {
  if (stage === "completed") return "Auszählung abgeschlossen";
  if (stage === "failed") return "Auszählung fehlgeschlagen";
  if (stage) {
    const found = PIPELINE.find((s) => s.key === stage);
    if (found) return `${found.label}…`;
  }
  if (sharesIn >= threshold) return "Auszählung läuft…";
  return null;
}

export function TallyPipeline({
  session,
  threshold,
  currentStage,
}: {
  session: SessionLike;
  threshold: number;
  currentStage: CurrentStage;
}) {
  const sharesIn = session.submitted_shares_count;
  const thresholdMet = sharesIn >= threshold;

  // Fine-grained stage only counts when it belongs to THIS session —
  // the stage file on Fly survives across runs.
  const liveStage =
    currentStage && currentStage.sessionId === session.id
      ? currentStage.stage
      : null;

  // Resolve the active step index.
  let activeIdx: number;
  let failed = false;
  let done = false;

  if (session.state === "completed" || liveStage === "completed") {
    activeIdx = PIPELINE.length;
    done = true;
  } else if (session.state === "aborted" || liveStage === "failed") {
    activeIdx = liveStage && liveStage !== "failed" ? stageIndex(liveStage) : thresholdMet ? 1 : 0;
    failed = true;
  } else if (liveStage) {
    activeIdx = Math.max(0, stageIndex(liveStage));
  } else if (!thresholdMet) {
    activeIdx = 0;
  } else {
    // Threshold met but no fine-grained info → pipeline is running
    // somewhere between reconstruction and verification. Mark the
    // middle as indeterminate.
    activeIdx = 1;
  }

  const indeterminate = thresholdMet && !liveStage && !done && !failed;

  return (
    <div className="space-y-1">
      {PIPELINE.map((step, i) => {
        const isDone = done || i < activeIdx;
        const isActive = !done && !failed && i === activeIdx;
        const isFailedHere = failed && i === activeIdx;
        const isPending = !isDone && !isActive && !isFailedHere;

        return (
          <div key={step.key} className="flex items-start gap-3">
            {/* Rail: dot + connector */}
            <div className="flex flex-col items-center self-stretch">
              <div
                className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  isFailedHere
                    ? "bg-red-600 text-white"
                    : isDone
                    ? "bg-green-600 text-white"
                    : isActive
                    ? "bg-blue-600 text-white"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                {isFailedHere ? "✕" : isDone ? "✓" : i + 1}
              </div>
              {i < PIPELINE.length - 1 && (
                <div
                  className={`w-px flex-1 min-h-3 ${
                    isDone ? "bg-green-600" : "bg-border"
                  }`}
                />
              )}
            </div>

            {/* Label + detail */}
            <div className="pb-3 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-sm ${
                    isActive || isFailedHere
                      ? "font-medium text-foreground"
                      : isDone
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
                {step.key === "awaiting-shares" && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {sharesIn}/{threshold}
                  </Badge>
                )}
                {isActive && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-blue-700">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    {indeterminate && i === 1 ? "läuft (Phase unbekannt)…" : "läuft…"}
                  </span>
                )}
                {isFailedHere && (
                  <span className="text-xs text-red-700">fehlgeschlagen</span>
                )}
              </div>
              <p
                className={`text-xs mt-0.5 ${
                  isPending ? "text-muted-foreground/60" : "text-muted-foreground"
                }`}
              >
                {step.detail}
              </p>
            </div>
          </div>
        );
      })}

      {/* Terminal row */}
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
            done
              ? "bg-green-600 text-white"
              : "bg-muted text-muted-foreground border border-border"
          }`}
        >
          {done ? "✓" : PIPELINE.length + 1}
        </div>
        <div className="min-w-0">
          <span
            className={`text-sm ${
              done ? "font-medium text-green-700" : "text-muted-foreground"
            }`}
          >
            Auszählung abgeschlossen
          </span>
          <p className="text-xs mt-0.5 text-muted-foreground/80">
            Ergebnis steht im Tally-Vertrag; Vorschlags-Status springt auf
            Angenommen/Abgelehnt
          </p>
        </div>
      </div>
    </div>
  );
}
