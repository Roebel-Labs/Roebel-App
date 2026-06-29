"use client";
import { useState, useCallback } from "react";
import { mapTxError, type FriendlyError } from "@/lib/gemeinschaftskasse/tx-errors";

export type ActionState =
  | { phase: "idle" }
  | { phase: "running"; step: number; steps: string[] }
  | { phase: "success"; message: string; txHash?: string }
  | { phase: "error"; error: FriendlyError };

/**
 * Drives a multi-step on-chain action with visible progress. `run` is given the
 * step labels up front and a `step(i)` callback to advance the indicator; on
 * throw it maps the error to a friendly message. Returns true on success.
 */
export function useTxAction() {
  const [state, setState] = useState<ActionState>({ phase: "idle" });
  const reset = useCallback(() => setState({ phase: "idle" }), []);

  const run = useCallback(
    async (
      steps: string[],
      fn: (step: (i: number) => void) => Promise<{ message: string; txHash?: string }>,
    ): Promise<boolean> => {
      setState({ phase: "running", step: 0, steps });
      try {
        const result = await fn((i) => setState({ phase: "running", step: i, steps }));
        setState({ phase: "success", message: result.message, txHash: result.txHash });
        return true;
      } catch (e) {
        setState({ phase: "error", error: mapTxError(e) });
        return false;
      }
    },
    [],
  );

  return { state, run, reset, busy: state.phase === "running" };
}
