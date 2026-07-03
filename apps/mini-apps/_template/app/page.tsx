"use client";

import { useCallback, useEffect, useState } from "react";
import { sdk } from "@netizen/miniapp-sdk";
import type { MiniAppContext, MuenzenBalance } from "@netizen/miniapp-sdk";

/**
 * Template demo screen.
 *
 * This one file demonstrates the whole client SDK surface a mini app needs:
 *  1. sdk.actions.ready()      — dismiss the host splash (MANDATORY)
 *  2. sdk.getContext()         — greet the user by display name (never an address)
 *  3. sdk.roebel.getMuenzenBalance() — show the Röbel-Münzen balance
 *  4. sdk.roebel.grantReward() — request a server-authorized reward
 *  5. sdk.track()              — fire-and-forget analytics
 *
 * The AI builder clones this file and mutates the UI per user prompt while
 * keeping this SDK wiring intact. Follow the DESIGN.md component idioms.
 */

type RewardState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "granted"; amount: number; remaining?: number }
  | { kind: "rejected" } // user declined the host confirm sheet
  | { kind: "budget" } // per-app reward budget exhausted (unreviewed apps = 0)
  | { kind: "error"; message: string };

export default function Page() {
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [balance, setBalance] = useState<MuenzenBalance | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [reward, setReward] = useState<RewardState>({ kind: "idle" });

  // ── 1. Announce readiness + load context/balance once mounted ─────────────
  // MANDATORY: the host renders a splash overlay until the mini app calls
  // ready(). Skip this and the user stares at an infinite splash — the #1
  // mistake. Call it as soon as the first screen can paint.
  useEffect(() => {
    let alive = true;

    void sdk.actions.ready();

    // Fire-and-forget analytics — never throws, never blocks render.
    sdk.track("template_opened");

    void sdk
      .getContext()
      .then((ctx) => {
        if (alive) setContext(ctx);
      })
      .catch(() => {
        /* running outside a host (plain browser dev) — leave context null */
      });

    void sdk.roebel
      .getMuenzenBalance()
      .then((b) => {
        if (alive) setBalance(b);
      })
      .catch(() => {
        if (alive) setBalanceError(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  // ── 4. Request a reward ───────────────────────────────────────────────────
  // grantReward is a *request*: the host backend validates the app is live,
  // meters the per-app budget, rate-limits, and dedupes on idempotencyKey.
  // Handle all outcomes explicitly — granted / rejected / budget / error.
  const claimReward = useCallback(async () => {
    setReward({ kind: "loading" });
    try {
      const res = await sdk.roebel.grantReward({
        amount: 5,
        reason: "template_demo",
        // A fresh key per attempt keeps the request idempotent server-side.
        idempotencyKey: crypto.randomUUID(),
      });

      if (res.granted) {
        void sdk.haptics.notification("success");
        sdk.track("reward_granted", { amount: 5 });
        setReward({ kind: "granted", amount: 5, remaining: res.remainingBudget });
        // Optimistically refresh the balance.
        void sdk.roebel
          .getMuenzenBalance()
          .then(setBalance)
          .catch(() => setBalanceError(true));
      } else {
        setReward({ kind: "budget" });
      }
    } catch (err) {
      const code = errorCode(err);
      if (code === "user_rejected") {
        setReward({ kind: "rejected" });
      } else if (code === "budget_exceeded" || code === "rate_limited") {
        setReward({ kind: "budget" });
      } else {
        setReward({ kind: "error", message: "Belohnung fehlgeschlagen. Bitte später erneut versuchen." });
      }
    }
  }, []);

  // Greet by display name only — NEVER render a wallet address (DESIGN.md §5).
  const displayName = context?.user?.displayName ?? "Jemand";

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">Röbel Mini-App</p>
        <h1 className="text-2xl font-semibold leading-tight">
          Hallo {displayName} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Willkommen in der Vorlage. Sie zeigt, wie eine Mini-App den Röbel-Münzen-Stand
          liest und eine Belohnung vergibt.
        </p>
      </header>

      {/* KPI card — Röbel-Münzen balance (label RÖ, never "CRC"/"Circles"). */}
      <section className="rounded-[10px] border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Dein Guthaben</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {balanceError ? "—" : balance ? formatBalance(balance.balance) : "…"}
          </span>
          <span className="text-sm font-medium text-muted-foreground">Röbel-Münzen · RÖ</span>
        </div>
        {balanceError ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Guthaben konnte nicht geladen werden.
          </p>
        ) : null}
      </section>

      {/* Reward action — full loading / granted / rejected / budget / error UX. */}
      <section className="rounded-[10px] border border-border bg-card p-4">
        <p className="text-sm font-medium">Beispiel-Belohnung</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Fordere 5 Röbel-Münzen an. Die App-Prüfung entscheidet, ob Belohnungen
          freigeschaltet sind.
        </p>

        <button
          type="button"
          onClick={claimReward}
          disabled={reward.kind === "loading"}
          className="mt-3 inline-flex w-full items-center justify-center rounded-[10px] bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
        >
          {reward.kind === "loading" ? "Wird angefordert …" : "Belohnung erhalten"}
        </button>

        <RewardFeedback state={reward} />
      </section>

      <footer className="mt-auto pt-2 text-center text-xs text-muted-foreground">
        Vorlage für Netizen Mini-Apps
      </footer>
    </main>
  );
}

// ── UI helpers ──────────────────────────────────────────────────────────────

function RewardFeedback({ state }: { state: RewardState }) {
  switch (state.kind) {
    case "granted":
      return (
        <p className="mt-2 text-xs text-success">
          {state.amount} Röbel-Münzen erhalten. 🎉
          {typeof state.remaining === "number"
            ? ` Verbleibendes Budget: ${state.remaining} RÖ.`
            : ""}
        </p>
      );
    case "rejected":
      return (
        <p className="mt-2 text-xs text-muted-foreground">
          Anfrage abgebrochen.
        </p>
      );
    case "budget":
      return (
        <p className="mt-2 text-xs text-warning">
          Derzeit sind keine Belohnungen verfügbar.
        </p>
      );
    case "error":
      return <p className="mt-2 text-xs text-error">{state.message}</p>;
    default:
      return null;
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Extract the frozen bridge error code from a rejected SDK call, if present. */
function errorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return undefined;
}

/** Balance arrives as a human-unit decimal string; show a compact integer. */
function formatBalance(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}
