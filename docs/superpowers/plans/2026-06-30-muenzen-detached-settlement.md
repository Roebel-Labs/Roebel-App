# Detached on-chain settlement for Röbel-Münzen rewards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple the Röbel-Münzen reward celebration from the 20-30s on-chain settlement so the reward screen reveals almost instantly while the transaction settles in the background with retry.

**Architecture:** A new `RoebelTalerProvider` lifts the per-component `useRoebelTaler` hook into one shared context that owns the real balance, an optimistic-delta map, and a background settlement queue (`enqueueSettlement`) built on a pure, tested `runWithRetry` core. A `useCelebrateSettling` orchestrator shows the reward screen with a short anticipation beat, reveals after ~1.7s, and hands the slow transaction to the queue. Terminal failures surface only as a soft snackbar; the balance reconciles to chain truth on settle.

**Tech Stack:** Expo SDK 55 / React Native, TypeScript, thirdweb (gasless Gnosis txs), jest-expo, AsyncStorage.

## Global Constraints

- **UI copy:** German primary. **Never** show `CRC` / `Circles` / `Token` / `personal token` in any user-facing string — the currency is only ever "Röbel Münzen" / "Münzen".
- **Styling:** `StyleSheet.create()` + `useTheme()`. NO NativeWind. Font tokens from `constants/theme.ts` (`heading` = `MonaSansSemiCondensed-Bold`).
- **Never show raw wallet addresses** in UI/notifications.
- **Package manager:** pnpm. Tests: `npx jest <path> --watchAll=false` (the default `test` script is `jest --watchAll`).
- **Balance display** everywhere = `realBalance + Σ optimistic deltas` (integer Münzen deltas only).
- Provider placement: `RoebelTalerProvider` MUST sit below both `GnosisWalletProvider` (needs `gnosisAccount`) and `SnackbarProvider` (needs `showSnackbar`).

---

### Task 1: Pure settlement retry core

**Files:**
- Create: `apps/expo/lib/muenzen-settlement.ts`
- Test: `apps/expo/lib/__tests__/muenzen-settlement.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `runWithRetry(settle: () => Promise<void>, opts?: RetryOptions): Promise<void>` — resolves on first success; throws the last error after all attempts exhausted.
  - `interface RetryOptions { attempts?: number; backoffMs?: number[]; sleep?: (ms: number) => Promise<void> }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/expo/lib/__tests__/muenzen-settlement.test.ts
import { runWithRetry } from '../muenzen-settlement';

describe('runWithRetry', () => {
  test('calls settle once and never sleeps on first success', async () => {
    const settle = jest.fn().mockResolvedValue(undefined);
    const sleep = jest.fn().mockResolvedValue(undefined);
    await runWithRetry(settle, { sleep });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('retries with backoff then succeeds', async () => {
    const settle = jest
      .fn()
      .mockRejectedValueOnce(new Error('rpc'))
      .mockRejectedValueOnce(new Error('rpc'))
      .mockResolvedValue(undefined);
    const sleep = jest.fn().mockResolvedValue(undefined);
    await runWithRetry(settle, { attempts: 3, backoffMs: [3000, 9000], sleep });
    expect(settle).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([3000, 9000]);
  });

  test('throws the last error after exhausting attempts', async () => {
    const settle = jest.fn().mockRejectedValue(new Error('boom'));
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(runWithRetry(settle, { attempts: 3, sleep })).rejects.toThrow('boom');
    expect(settle).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/expo && npx jest lib/__tests__/muenzen-settlement.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module '../muenzen-settlement'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/expo/lib/muenzen-settlement.ts

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Backoff (ms) before each retry, indexed from the first retry. Default [3000, 9000]. */
  backoffMs?: number[];
  /** Injectable sleeper so tests stay deterministic. Default real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `settle` with retries + backoff. Resolves the moment it succeeds; throws
 * the last error after all attempts are exhausted. Pure — no React, no globals
 * beyond the injectable sleeper — so it unit-tests cleanly.
 */
export async function runWithRetry(
  settle: () => Promise<void>,
  { attempts = 3, backoffMs = [3000, 9000], sleep = defaultSleep }: RetryOptions = {},
): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await settle();
      return;
    } catch (err) {
      lastErr = err;
      const isLast = i >= attempts - 1;
      if (!isLast) {
        const wait = backoffMs[i] ?? backoffMs[backoffMs.length - 1] ?? 0;
        if (wait > 0) await sleep(wait);
      }
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/expo && npx jest lib/__tests__/muenzen-settlement.test.ts --watchAll=false`
Expected: PASS — 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/muenzen-settlement.ts apps/expo/lib/__tests__/muenzen-settlement.test.ts
git commit -m "feat(expo): pure runWithRetry settlement core for Münzen rewards"
```

---

### Task 2: RoebelTalerProvider (shared balance + optimistic deltas + settlement queue)

**Files:**
- Create: `apps/expo/context/RoebelTalerProvider.tsx`
- Modify: `apps/expo/hooks/useRoebelTaler.ts` (becomes a context reader; identical return shape + `enqueueSettlement`)
- Modify: `apps/expo/app/_layout.tsx` (mount provider below `SnackbarProvider`)

**Interfaces:**
- Consumes: `runWithRetry` (Task 1); `useGnosisWallet`, `useSnackbar`; the `isOnboarded / getRoebelTalerBalance / getMintableTaler / formatTaler / prepareDailyMint / prepareOnboard / prepareContributeToRoebelTaler / prepareSendRoebelTaler / findInviter / getPersonalCrcBalance` helpers already used by the current hook.
- Produces — the context value (superset of today's hook return):
  - `talerBalance: number`, `balanceRaw: bigint` (both include optimistic deltas)
  - `mintable: number`, `mintableRaw: bigint`, `onboarded: boolean`, `loading: boolean`, `minting: boolean`, `onboarding: boolean`, `sending: boolean`
  - `dailyMint: () => Promise<void>` (two sends only — NO internal refresh)
  - `onboard: () => Promise<void>`, `send: (to: string, amount: bigint) => Promise<void>`, `refresh: () => Promise<void>`, `account`
  - `enqueueSettlement(job: SettlementJob): void`
  - `interface SettlementJob { label: string; amount: number; settle: () => Promise<void>; onConfirmed?: () => void; onFailed?: () => void }`

- [ ] **Step 1: Create the provider**

Move the current `useRoebelTaler` body into a provider. Add `pendingDeltas`, `reconcile` (refresh without the loading flag), `enqueueSettlement`, and fold deltas into the exposed balance. `dailyMint` drops its trailing `await refresh()` (the queue reconciles).

```tsx
// apps/expo/context/RoebelTalerProvider.tsx
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { sendTransaction } from 'thirdweb';
import { useGnosisWallet } from '@/context/GnosisWalletContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { runWithRetry } from '@/lib/muenzen-settlement';
import {
  isOnboarded, findInviter, getRoebelTalerBalance, getPersonalCrcBalance,
  getMintableTaler, formatTaler, prepareDailyMint, prepareOnboard,
  prepareContributeToRoebelTaler, prepareSendRoebelTaler,
} from '@/lib/roebel-taler';

export interface SettlementJob {
  /** Soft-notice noun, e.g. "Münzen" | "Stimme". Never expose CRC/Circles. */
  label: string;
  /** Optimistic balance delta in whole Münzen (0 when the amount is unknown). */
  amount: number;
  settle: () => Promise<void>;
  onConfirmed?: () => void;
  onFailed?: () => void;
}

interface RoebelTalerContextValue {
  talerBalance: number;
  balanceRaw: bigint;
  mintable: number;
  mintableRaw: bigint;
  onboarded: boolean;
  loading: boolean;
  minting: boolean;
  onboarding: boolean;
  sending: boolean;
  dailyMint: () => Promise<void>;
  onboard: () => Promise<void>;
  send: (to: string, amount: bigint) => Promise<void>;
  refresh: () => Promise<void>;
  enqueueSettlement: (job: SettlementJob) => void;
  account: ReturnType<typeof useGnosisWallet>['gnosisAccount'];
}

export const RoebelTalerContext = createContext<RoebelTalerContextValue | undefined>(undefined);

const ONE = 10n ** 18n;

export function RoebelTalerProvider({ children }: { children: React.ReactNode }) {
  const { gnosisAccount, ready } = useGnosisWallet();
  const { showSnackbar } = useSnackbar();
  const address = gnosisAccount?.address;

  const [balanceRaw, setBalanceRaw] = useState<bigint>(0n);
  const [mintableRaw, setMintableRaw] = useState<bigint>(0n);
  const [onboarded, setOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [minting, setMinting] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [sending, setSending] = useState(false);
  // Optimistic deltas (whole Münzen) keyed by settlement id.
  const [pendingDeltas, setPendingDeltas] = useState<Record<number, number>>({});
  const settlementSeq = useRef(0);

  // Re-read on-chain state WITHOUT toggling the loading flag (used for the
  // background reconcile so no consumer flashes a spinner mid-settle).
  const reconcile = useCallback(async () => {
    if (!address) return;
    const [ob, bal, mintable] = await Promise.all([
      isOnboarded(address).catch(() => false),
      getRoebelTalerBalance(address).catch(() => 0n),
      getMintableTaler(address).catch(() => 0n),
    ]);
    setOnboarded(ob);
    setBalanceRaw(bal);
    setMintableRaw(mintable);
  }, [address]);

  const refresh = useCallback(async () => {
    if (!address) { setLoading(false); return; }
    setLoading(true);
    try { await reconcile(); } finally { setLoading(false); }
  }, [address, reconcile]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!address || !onboarded) return;
    const tick = () => { void getMintableTaler(address).then(setMintableRaw).catch(() => {}); };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [address, onboarded]);

  // Two gasless sends only — NO refresh. The settlement queue reconciles after.
  const dailyMint = useCallback(async () => {
    if (!gnosisAccount) throw new Error('Gnosis-Konto noch nicht bereit');
    setMinting(true);
    try {
      await sendTransaction({ account: gnosisAccount, transaction: prepareDailyMint() });
      const pcrc = await getPersonalCrcBalance(gnosisAccount.address).catch(() => 0n);
      if (pcrc > 0n) {
        await sendTransaction({
          account: gnosisAccount,
          transaction: prepareContributeToRoebelTaler(gnosisAccount.address, pcrc),
        });
      }
    } finally {
      setMinting(false);
    }
  }, [gnosisAccount]);

  const onboard = useCallback(async () => {
    if (!gnosisAccount) throw new Error('Gnosis-Konto noch nicht bereit');
    setOnboarding(true);
    try {
      if (await isOnboarded(gnosisAccount.address)) { await refresh(); return; }
      const inviter = await findInviter(gnosisAccount.address);
      if (!inviter) {
        throw Object.assign(
          new Error('Du wurdest noch nicht eingeladen. Lass dich von einem Bürger einladen (z. B. in Metri deine Adresse einladen), dann hier erneut tippen.'),
          { code: 'NOT_INVITED' as const },
        );
      }
      await sendTransaction({ account: gnosisAccount, transaction: prepareOnboard(inviter) });
      await refresh();
    } finally {
      setOnboarding(false);
    }
  }, [gnosisAccount, refresh]);

  const send = useCallback(async (to: string, amount: bigint) => {
    if (!gnosisAccount) throw new Error('Gnosis-Konto noch nicht bereit');
    setSending(true);
    try {
      await sendTransaction({
        account: gnosisAccount,
        transaction: prepareSendRoebelTaler(gnosisAccount.address, to, amount),
      });
      await refresh();
    } finally {
      setSending(false);
    }
  }, [gnosisAccount, refresh]);

  const enqueueSettlement = useCallback((job: SettlementJob) => {
    const id = settlementSeq.current + 1;
    settlementSeq.current = id;
    if (job.amount > 0) setPendingDeltas((m) => ({ ...m, [id]: Math.round(job.amount) }));
    const dropDelta = () =>
      setPendingDeltas((m) => { const n = { ...m }; delete n[id]; return n; });
    void (async () => {
      try {
        await runWithRetry(job.settle);
        await reconcile();   // real balance now includes the mint…
        dropDelta();         // …drop the optimistic delta in the same async tick
        job.onConfirmed?.();
      } catch (err) {
        dropDelta();
        job.onFailed?.();
        await reconcile().catch(() => {});
        showSnackbar({
          message: `Deine ${job.label} sind noch unterwegs — wir versuchen es gleich erneut.`,
        });
        console.warn('[Münzen] settlement failed:', err);
      }
    })();
  }, [reconcile, showSnackbar]);

  const deltaSum = useMemo(
    () => Object.values(pendingDeltas).reduce((a, b) => a + b, 0),
    [pendingDeltas],
  );
  const optimisticRaw = balanceRaw + BigInt(Math.round(deltaSum)) * ONE;

  const value = useMemo<RoebelTalerContextValue>(() => ({
    talerBalance: Number(formatTaler(optimisticRaw)),
    balanceRaw: optimisticRaw,
    mintable: Number(formatTaler(mintableRaw)),
    mintableRaw,
    onboarded,
    loading: loading || !ready,
    minting,
    onboarding,
    sending,
    dailyMint,
    onboard,
    send,
    refresh,
    enqueueSettlement,
    account: gnosisAccount,
  }), [optimisticRaw, mintableRaw, onboarded, loading, ready, minting, onboarding,
       sending, dailyMint, onboard, send, refresh, enqueueSettlement, gnosisAccount]);

  return <RoebelTalerContext.Provider value={value}>{children}</RoebelTalerContext.Provider>;
}
```

- [ ] **Step 2: Repoint the hook to the context (no call-site churn)**

```ts
// apps/expo/hooks/useRoebelTaler.ts
import { useContext } from 'react';
import { RoebelTalerContext } from '@/context/RoebelTalerProvider';

/**
 * Real on-chain Röbel Münzen (Circles on Gnosis), now backed by a single shared
 * RoebelTalerProvider so the balance + optimistic deltas + settlement queue are
 * consistent across every screen. Identical return shape to the old hook, plus
 * `enqueueSettlement`. User-facing term is always "Röbel Münzen".
 */
export function useRoebelTaler() {
  const ctx = useContext(RoebelTalerContext);
  if (!ctx) throw new Error('useRoebelTaler must be used within RoebelTalerProvider');
  return ctx;
}
```

- [ ] **Step 3: Mount the provider in `_layout.tsx`**

Add the import near the other context imports:

```tsx
import { RoebelTalerProvider } from '@/context/RoebelTalerProvider';
```

Wrap so it sits just inside `SnackbarProvider` (line ~314) and around `RewardCelebrationProvider`:

```tsx
                          <SnackbarProvider>
                            <RoebelTalerProvider>
                            <RewardCelebrationProvider>
                            <PendingPostFeedbackProvider>
                              <ExploreDotProvider>
                                <ConsentGate />
                                <AppUpdateGate />
                                <ThemedLayout />
                              </ExploreDotProvider>
                            </PendingPostFeedbackProvider>
                            </RewardCelebrationProvider>
                            </RoebelTalerProvider>
                          </SnackbarProvider>
```

- [ ] **Step 4: Verify typecheck on the touched files + boot the app**

Run: `cd apps/expo && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "RoebelTalerProvider|useRoebelTaler|_layout" || echo "no new errors in touched files"`
Expected: `no new errors in touched files` (repo has ~431 pre-existing unrelated tsc errors; only assert none were introduced in these three files).

Run: `cd apps/expo && pnpm start` → open the app → go to the Rewards screen.
Expected: the Münzen balance renders exactly as before; no crash; "Heute abholen" still shows the accruing amount.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/context/RoebelTalerProvider.tsx apps/expo/hooks/useRoebelTaler.ts apps/expo/app/_layout.tsx
git commit -m "feat(expo): lift useRoebelTaler into shared RoebelTalerProvider with settlement queue"
```

---

### Task 3: Thread an optional `message` reveal through the celebration overlay

Votes don't know their Münzen payout up front, so they reveal a number-less "thank-you" headline. The reward screen already supports a `message` prop; this task threads it through the context + overlay so the pending flow can reveal text instead of a number.

**Files:**
- Modify: `apps/expo/context/RewardCelebrationContext.tsx`
- Modify: `apps/expo/components/rewards/MuenzenRewardOverlay.tsx`

**Interfaces:**
- Consumes: existing `celebratePending` / `MuenzenRewardView` (already has a `message?: string` prop).
- Produces: `PendingOptions` gains `message?: string`; `MuenzenRewardOverlay` forwards `message`. `resolve(amount)` is unchanged — with `amount = 0` and a `message` present, the view reveals the message.

- [ ] **Step 1: Add `message` to `PendingOptions`, `QueueItem`, and the overlay props in `RewardCelebrationContext.tsx`**

In `interface PendingOptions` add:

```ts
  /** Headline text to reveal instead of a number (e.g. a vote thank-you). */
  message?: string;
```

In `interface QueueItem` add `message?: string;`.

In `celebratePending`, include `message` when pushing the queue item:

```ts
    setQueue((q) => [
      ...q,
      {
        id,
        amount: 0,
        subtitle: opts?.subtitle,
        message: opts?.message,
        loading: true,
        loadingLabel: opts?.loadingLabel,
        coin: opts?.coin,
        onClose,
      },
    ]);
```

In the rendered `<MuenzenRewardOverlay …>` add:

```tsx
        message={current?.message}
```

- [ ] **Step 2: Forward `message` in `MuenzenRewardOverlay.tsx`**

Add `message?: string;` to `MuenzenRewardOverlayProps`, accept it in the destructure, and pass it to `<MuenzenRewardView … message={message} />`.

- [ ] **Step 3: Verify typecheck on touched files**

Run: `cd apps/expo && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "RewardCelebrationContext|MuenzenRewardOverlay" || echo "no new errors in touched files"`
Expected: `no new errors in touched files`.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/context/RewardCelebrationContext.tsx apps/expo/components/rewards/MuenzenRewardOverlay.tsx
git commit -m "feat(expo): support a number-less message reveal in the reward overlay"
```

---

### Task 4: `useCelebrateSettling` orchestrator hook

**Files:**
- Create: `apps/expo/hooks/useCelebrateSettling.ts`

**Interfaces:**
- Consumes: `useRewardCelebration().celebratePending`, `useRoebelTaler().enqueueSettlement`.
- Produces: `useCelebrateSettling(): (opts: CelebrateSettlingOptions) => void`
  ```ts
  interface CelebrateSettlingOptions {
    amount?: number;        // reveal this number (daily mint)
    message?: string;       // OR reveal this headline (vote thank-you)
    coin?: 'single' | 'many';
    subtitle?: string;
    label: string;          // soft-notice noun
    settle: () => Promise<void>;
    onConfirmed?: () => void;
    onFailed?: () => void;
    loadingLabel?: string | string[];
    onClose?: () => void;
  }
  ```

- [ ] **Step 1: Create the hook**

```ts
// apps/expo/hooks/useCelebrateSettling.ts
import { useCallback } from 'react';
import { useRewardCelebration } from '@/context/RewardCelebrationContext';
import { useRoebelTaler } from '@/hooks/useRoebelTaler';

/** Anticipation beat: how long the loading screen shows before the reveal. */
export const REWARD_BEAT_MS = 1700;

export interface CelebrateSettlingOptions {
  amount?: number;
  message?: string;
  coin?: 'single' | 'many';
  subtitle?: string;
  label: string;
  settle: () => Promise<void>;
  onConfirmed?: () => void;
  onFailed?: () => void;
  loadingLabel?: string | string[];
  onClose?: () => void;
}

/**
 * Show the Röbel-Münzen reward screen with a short anticipation beat, reveal the
 * (already-known) amount or a thank-you message after ~1.7s, and hand the slow
 * on-chain work to the background settlement queue. The chain no longer gates
 * the reveal — the tx settles detached with retry + soft-notice on failure.
 */
export function useCelebrateSettling() {
  const { celebratePending } = useRewardCelebration();
  const { enqueueSettlement } = useRoebelTaler();

  return useCallback((opts: CelebrateSettlingOptions) => {
    const reward = celebratePending({
      coin: opts.coin,
      subtitle: opts.subtitle,
      message: opts.message,
      loadingLabel: opts.loadingLabel,
      onClose: opts.onClose,
    });
    // Detach the slow settlement immediately (registers the optimistic delta).
    enqueueSettlement({
      label: opts.label,
      amount: opts.amount ?? 0,
      settle: opts.settle,
      onConfirmed: opts.onConfirmed,
      onFailed: opts.onFailed,
    });
    // Reveal after the beat regardless of chain state. resolve(0) + a message
    // reveals the headline text; resolve(n>0) reveals the number.
    setTimeout(() => reward.resolve(opts.amount ?? 0), REWARD_BEAT_MS);
  }, [celebratePending, enqueueSettlement]);
}
```

- [ ] **Step 2: Verify typecheck on the new file**

Run: `cd apps/expo && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "useCelebrateSettling" || echo "no new errors in touched files"`
Expected: `no new errors in touched files`.

- [ ] **Step 3: Commit**

```bash
git add apps/expo/hooks/useCelebrateSettling.ts
git commit -m "feat(expo): useCelebrateSettling — anticipation-beat reveal + detached settle"
```

---

### Task 5: Wire the daily mint to detached settlement

**Files:**
- Modify: `apps/expo/app/rewards/index.tsx` (`onDailyMint`, ~line 204)

**Interfaces:**
- Consumes: `useCelebrateSettling()` (Task 4); `dailyMint` (now two-sends-only, Task 2); existing local helpers `rtClaimKey`, `rtStreakKey`, `dayStart`, and state setters `setLastClaim`, `setNowTs`, `setRtStreak`; existing `lastClaim`, `rtStreak`.
- Produces: nothing new.

- [ ] **Step 1: Add the orchestrator hook near the other reward hooks**

At the top of the component, alongside `const { celebrate, celebratePending } = useRewardCelebration();`, add:

```tsx
  const celebrateSettling = useCelebrateSettling();
```

and the import:

```tsx
import { useCelebrateSettling } from '@/hooks/useCelebrateSettling';
```

- [ ] **Step 2: Replace `onDailyMint` with the detached version**

```tsx
  const onDailyMint = useCallback(() => {
    if (!talerAccount) {
      Alert.alert('Heute abholen', 'Dein Konto wird noch geladen. Bitte gleich erneut versuchen.');
      return;
    }
    const received = Math.max(1, Math.round(talerMintable));
    const addr = talerAccount.address;
    const ts = Date.now();
    const today = dayStart(ts);

    // Snapshot for rollback if the background mint ultimately fails.
    const prevLastClaim = lastClaim;
    const prevStreak = rtStreak;

    // Optimistic cooldown + streak so the button flips immediately.
    let nextStreak = 1;
    try {
      const lastDay = prevLastClaim != null ? dayStart(prevLastClaim) : 0;
      if (lastDay === today) nextStreak = prevStreak;
      else if (lastDay === today - 86_400_000) nextStreak = prevStreak + 1;
    } catch { /* fresh streak */ }
    setLastClaim(ts);
    setNowTs(Date.now());
    setRtStreak(nextStreak);
    AsyncStorage.setItem(rtClaimKey(addr), String(ts)).catch(() => {});
    AsyncStorage.setItem(rtStreakKey(addr), JSON.stringify({ count: nextStreak, lastDay: today })).catch(() => {});

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    celebrateSettling({
      amount: received,
      coin: received === 1 ? 'single' : 'many',
      subtitle: 'Deine Röbel Münzen für diese Stunde sind da. Komm regelmäßig vorbei und sammle weiter.',
      label: 'Münzen',
      loadingLabel: [
        'Münzen werden abgeholt…',
        'Einen Moment noch…',
        'Fast geschafft…',
      ],
      settle: dailyMint,
      onFailed: () => {
        // Roll back the optimistic cooldown/streak so the user can retry; the
        // mintable accrual is still on-chain and reappears on the next refresh.
        setLastClaim(prevLastClaim);
        setRtStreak(prevStreak);
        if (prevLastClaim != null) AsyncStorage.setItem(rtClaimKey(addr), String(prevLastClaim)).catch(() => {});
        else AsyncStorage.removeItem(rtClaimKey(addr)).catch(() => {});
      },
    });
  }, [dailyMint, talerAccount, talerMintable, lastClaim, rtStreak, celebrateSettling]);
```

> Note: `dailyMint` here is the provider's two-sends-only version (Task 2). The optimistic balance bump (`amount: received`) is applied by `enqueueSettlement`; the real balance reconciles on settle.

- [ ] **Step 3: Verify on a simulator/device**

Run: `cd apps/expo && pnpm ios` (or `pnpm start` → open).
Manual checks:
1. Tap "Heute abholen". The reward screen appears, shows the loading beat for ~1.7s, then reveals "+N MÜNZEN".
2. The screen is dismissible ("Weiter") within ~2s — you are NOT stuck for 20-30s.
3. Returning to the rewards screen, the balance shows the bumped amount immediately and the "Heute abholen" button is in its collected/cooldown state.
4. ~20-30s later the balance is unchanged (reconciled to the same number) — no double-count, no flicker.

- [ ] **Step 4: Commit**

```bash
git add apps/expo/app/rewards/index.tsx
git commit -m "feat(expo): daily Münzen mint reveals instantly, settles in background"
```

---

### Task 6: SemiCondensed amount headline

**Files:**
- Modify: `apps/expo/components/rewards/MuenzenRewardView.tsx` (`styles.amount`, ~line 230)

- [ ] **Step 1: Change the amount font family**

In `styles.amount`, change:

```tsx
    fontFamily: 'Inter-Bold',
```

to:

```tsx
    fontFamily: 'MonaSansSemiCondensed-Bold',
```

(the `heading` token — SemiCondensed reads tighter at the 60px amount size).

- [ ] **Step 2: Verify visually**

Run the app, trigger a daily mint, confirm the "+N MÜNZEN" headline now renders in the SemiCondensed face and still fits on one line (the existing `adjustsFontSizeToFit` handles large numbers).

- [ ] **Step 3: Commit**

```bash
git add apps/expo/components/rewards/MuenzenRewardView.tsx
git commit -m "style(expo): reward amount headline uses SemiCondensed (heading token)"
```

---

### Task 7: Wire voting to detached settlement (number-less reveal)

The vote's Münzen payout is unknown up front (it comes from `claimReward` after the tx), so votes reveal a thank-you message and let the payout reconcile into the balance. Only the slow `publishMessage` send + mirror + claim are detached; the fast prepare (read coordinator key, build + sign) stays synchronous and gated. The privacy bottom sheet now opens on dismiss unconditionally (the vote is committed once enqueued).

**Files:**
- Modify: `apps/expo/components/VoteButtons.tsx` (`castVote`, ~lines 496-654)

**Interfaces:**
- Consumes: `useCelebrateSettling()` (Task 4). Existing in-scope identifiers: `getKeypair`, `getLastVote`, `getNextNonce`, `getPollContract`, `buildVoteMessage`, `readContract`, `prepareContractCall`, `sendTransaction`, `recordVote`, `recordVoteToSupabase`, `claimReward`, `track`, `setSuccessDrawer`, `setErrorDrawer`, `onVoteSuccess`, `VOTE_REWARD_SUBTITLE`, `VOTE_PRIVACY_MESSAGE`, `extractErrorMessage`.
- Produces: nothing new.

- [ ] **Step 1: Swap the celebration hook**

Replace `const { celebratePending } = useRewardCelebration();` (line ~131) with:

```tsx
  const celebrateSettling = useCelebrateSettling();
```

and add the import:

```tsx
import { useCelebrateSettling } from '@/hooks/useCelebrateSettling';
```

(Leave any other `useRewardCelebration` usage in the file intact if present; only the `celebratePending` destructure for `castVote` is replaced.)

- [ ] **Step 2: Rewrite `castVote` — synchronous prepare, then detached settle**

```tsx
  const castVote = async (support: VoteType) => {
    if (!canVote || !account || !pollAddress || pollId === null) return;
    if (signUpState.status !== 'signed-up') return;
    if (!gnosisAccount) {
      setErrorDrawer({ visible: true, message: 'Dein Konto wird noch geladen. Bitte versuche es gleich erneut.' });
      return;
    }
    const kp = getKeypair();
    if (!kp) return;

    const isChangingVote = !!getLastVote(pollAddress);

    try {
      setVotingFor(support);
      setPhase('encrypting-vote');

      // ---- PREPARE (fast, gated): a failure here is a real error, no celebration ----
      const optionIndex = toBigInt(support);
      const nonce = getNextNonce(pollAddress);
      const poll = getPollContract(pollAddress);
      const pollCoordinatorPub = (await readContract({
        contract: poll,
        method: 'function coordinatorPubKey() view returns (uint256 x, uint256 y)',
        params: [],
      })) as readonly [bigint, bigint];
      const coordinatorPubKey = new PubKey([
        toBigInt(pollCoordinatorPub[0]),
        toBigInt(pollCoordinatorPub[1]),
      ]);
      const { message, encPubKey } = buildVoteMessage({
        voterKeypair: kp,
        voterStateIndex: signUpState.stateIndex,
        pollId,
        voteOptionIndex: optionIndex,
        voiceCredits: 1n,
        nonce,
        coordinatorPubKey,
      });
      const messageFixed = message as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
      const tx = prepareContractCall({
        contract: poll,
        method: 'function publishMessage((uint256[10] data) _message, (uint256 x, uint256 y) _encPubKey)',
        params: [{ data: messageFixed }, encPubKey],
      });

      // ---- The vote is now committed. The slow on-chain work runs detached. ----
      const settle = async () => {
        const receipt = await sendTransaction({ transaction: tx, account: gnosisAccount });
        track(Events.PROPOSAL_VOTED, {
          proposal_id: proposalId.toString(),
          poll_id: pollId.toString(),
          vote_type: VoteType[support] ?? String(support),
          nonce: nonce.toString(),
          tx_hash: receipt.transactionHash,
          encrypted: true,
        });
        await recordVote(pollAddress, support, nonce, receipt.transactionHash);
        // Mirror first so the claim-reward verifier finds the vote, then claim.
        await recordVoteToSupabase({
          walletAddress: account.address,
          proposalId: proposalId.toString(),
          voteType: support,
          transactionHash: receipt.transactionHash,
        });
        await claimReward(account.address, 'proposal_vote', proposalId.toString()).catch(() => {});
      };

      const showPrivacySheet = () => {
        setChanging(false);
        setTimeout(
          () => setSuccessDrawer({ visible: true, message: VOTE_PRIVACY_MESSAGE, action: () => onVoteSuccess() }),
          350,
        );
      };

      if (isChangingVote) {
        // No reward screen for a changed vote — settle quietly, show privacy sheet.
        enqueueVoteSettleNoReward(settle);   // see note below
        showPrivacySheet();
      } else {
        celebrateSettling({
          message: 'Stimme abgegeben',
          coin: 'single',
          subtitle: VOTE_REWARD_SUBTITLE,
          label: 'Stimme',
          loadingLabel: [
            'Stimme wird versiegelt…',
            'Belohnung wird vorbereitet…',
            'Fast geschafft…',
          ],
          settle,
          onClose: showPrivacySheet,
        });
      }
    } catch (err) {
      console.error('[VoteButtons] vote prepare failed:', err);
      setErrorDrawer({
        visible: true,
        message: extractErrorMessage(err, 'Stimme konnte nicht abgegeben werden.'),
      });
    } finally {
      setPhase('idle');
      setTxSubstate(null);
      setVotingFor(null);
    }
  };
```

> **Changed-vote note:** a changed vote earns no reward, so it must still settle (publish) but without the reward overlay. Reuse the same detached queue by pulling `enqueueSettlement` from `useRoebelTaler()` in this component and defining a tiny local helper:
> ```tsx
> const { enqueueSettlement } = useRoebelTaler();
> const enqueueVoteSettleNoReward = (settle: () => Promise<void>) =>
>   enqueueSettlement({ label: 'Stimme', amount: 0, settle });
> ```
> Add `useRoebelTaler` to the imports if not already present.

- [ ] **Step 3: Remove now-dead state**

Delete the `let voteSucceeded = false;` line and any remaining references — the privacy sheet now shows unconditionally on commit. Confirm no other code in `castVote` references `voteSucceeded` or the old `reward` handle.

- [ ] **Step 4: Verify on a simulator/device**

Run: `cd apps/expo && pnpm ios`.
Manual checks:
1. Cast a first vote on a proposal. The reward screen appears, shows the beat ~1.7s, reveals "Stimme abgegeben" + the reward subtitle. Dismissible within ~2s.
2. On "Weiter", the privacy bottom sheet appears over the voted state.
3. The ballot still lands on-chain (check the vote registers / LastVoteCard reflects it). Any vote-reward Münzen appear in the balance shortly after (reconcile).
4. Change an existing vote: no reward screen, privacy sheet shows, vote updates.
5. Force a `publishMessage` failure (e.g. airplane mode after prepare): a single soft snackbar appears ("Deine Stimme sind noch unterwegs…"), no blocking alert.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/components/VoteButtons.tsx
git commit -m "feat(expo): voting reveals instantly, publishes + claims in background"
```

---

## Self-Review

**Spec coverage:**
- Silent retry + soft notice → Task 1 (`runWithRetry`) + Task 2 (`enqueueSettlement` catch → snackbar). ✓
- Short anticipation beat → Task 4 (`REWARD_BEAT_MS = 1700`, reveal after beat). ✓
- Optimistic bump + reconcile → Task 2 (`pendingDeltas` → `optimisticRaw`; `reconcile` after settle drops delta). ✓
- Approach A (lift to provider) → Task 2. ✓
- Daily mint flow (optimistic cooldown/streak, `onFailed` rollback) → Task 5. ✓
- Vote flow (synchronous prepare gated, detached publish+claim, unconditional privacy sheet, number-less reveal) → Task 3 (message plumbing) + Task 7. ✓
- SemiCondensed headline → Task 6. ✓
- Checkpoint/QR deferred to phase 2 → not in plan (intentional). ✓
- No raw addresses / no CRC jargon → Global Constraints; soft-notice + vote copy comply. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `SettlementJob` shape identical in Task 2 (definition) and Tasks 4/5/7 (use). `enqueueSettlement` signature consistent. `celebrateSettling` options (`amount?`/`message?`/`label`/`settle`/`onFailed`/`onClose`) consistent across Tasks 4, 5, 7. `dailyMint` = two-sends-only in both Task 2 (def) and Task 5 (use). ✓
