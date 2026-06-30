# Gemeinschaftskasse Messages (App Signature-Requests) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Anfragen" tab that lists pending Safe **messages** (signature-requests from connected apps like Monerium) and lets owners co-sign them in the dashboard, plus auto-refresh on the Anfragen tab and the transaction queue.

**Architecture:** Reuses the existing server-side signing infra — `assembleSenderSignature` (ERC-1271/ECDSA envelope) + `resolveCitizenProfiles` on the server, `resolveSigner` on the client. New api-kit message calls (`getMessages`/`addMessageSignature`) live in `safe-server.ts` behind two new admin-gated routes; the client only signs the `messageHash` and posts. No execute step (messages just collect signatures).

**Tech Stack:** Next.js 15 (server routes + client components), TypeScript, `@safe-global/api-kit` (server-only), thirdweb (client signing), shadcn Avatar/Skeleton.

## Global Constraints

- All Safe/Supabase work **server-side** — NO `@safe-global/*` or Supabase admin client in any `"use client"` file (keeps the build OOM-safe + key server-only).
- German UI; currency only "Röbel-Münzen"/"€" (never CRC); never a raw 0x as a primary label (signers via `resolveCitizenProfiles`).
- Routes admin-gated (`requireAdmin`/`jsonError` from `@/lib/muenzen/api`), `export const dynamic = "force-dynamic"`.
- Safe `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa` (GK_SAFE), chain Gnosis (100). `required` for a message = the Safe **threshold** (messages have no `confirmationsRequired`).
- Message signing REUSES transaction signing: owner signs the `messageHash`; envelope via `assembleSenderSignature` (ERC-1271 for smart-account owners, ECDSA for EOA); submit via `addMessageSignature`. NO execute step.
- Auto-refresh = `setInterval(fn, 15000)` in a `useEffect` with cleanup. Brand `#00498B`.
- `apps/web` has no test runner; verify with `tsc` + a controller live check + browser. Commit per task (pathspec `git commit -- <files>`); push at end.

---

## File map

**Create**
- `apps/web/src/app/api/gemeinschaftskasse/messages/route.ts` — GET pending messages.
- `apps/web/src/app/api/gemeinschaftskasse/confirm-message/route.ts` — POST a message signature.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Anfragen.tsx` — the Anfragen tab UI.

**Modify**
- `apps/web/src/lib/gemeinschaftskasse/constants.ts` — add `MessageView`.
- `apps/web/src/lib/gemeinschaftskasse/safe-server.ts` — add `getPendingMessages` + `addMessageConfirmation` + `appNameFromOrigin`.
- `apps/web/src/lib/gemeinschaftskasse/safe-client.ts` — add `confirmMessage`.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Tabs.tsx` — optional per-tab badge.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/page.tsx` — add "Anfragen" tab + badge.
- `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/PendingQueue.tsx` — add 15s auto-refresh.

---

### Task 1: Backend — MessageView type, server functions, routes

**Files:**
- Modify: `apps/web/src/lib/gemeinschaftskasse/constants.ts`
- Modify: `apps/web/src/lib/gemeinschaftskasse/safe-server.ts`
- Create: `apps/web/src/app/api/gemeinschaftskasse/messages/route.ts`
- Create: `apps/web/src/app/api/gemeinschaftskasse/confirm-message/route.ts`

**Interfaces:**
- Consumes: `getApiKit()` (api-kit factory), `assembleSenderSignature({inner, ownerAddress, isSmart})`, `resolveCitizenProfiles` (server), `GK_SAFE`, `TxSigner` type, `requireAdmin`/`jsonError`.
- Produces: `MessageView`; `getPendingMessages(): Promise<MessageView[]>`; `addMessageConfirmation({messageHash, inner, ownerAddress, isSmart}): Promise<void>`; routes `GET /messages`, `POST /confirm-message`.

- [ ] **Step 1: Add `MessageView` to `constants.ts`**

```ts
export interface MessageView {
  messageHash: string;
  app: string;
  text: string;
  confirmations: number;
  required: number;
  signers: TxSigner[];
  date: string | null;
  fullySigned: boolean;
}
```

- [ ] **Step 2: Add server functions to `safe-server.ts`**

Append (the file already imports `getApiKit`, `GK_SAFE`, and has `assembleSenderSignature`; add imports for `resolveCitizenProfiles` and the `MessageView`/`TxSigner` types):
```ts
import { resolveCitizenProfiles } from "./citizens";
import type { MessageView, TxSigner } from "./constants";

/** Friendly app name from a Safe message `origin` (URL string or JSON). */
function appNameFromOrigin(origin: unknown): string {
  if (!origin || typeof origin !== "string") return "App";
  try {
    if (origin.startsWith("{")) {
      const o = JSON.parse(origin);
      if (o?.name) return String(o.name);
      if (o?.url) origin = String(o.url);
    }
    const host = new URL(origin as string).hostname.replace(/^www\./, "");
    const label = host.split(".")[0] || host;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return "App";
  }
}

export async function getPendingMessages(): Promise<MessageView[]> {
  const kit = getApiKit();
  const [res, info] = await Promise.all([
    kit.getMessages(GK_SAFE),
    kit.getSafeInfo(GK_SAFE),
  ]);
  const required = Number(info.threshold);
  const list = (res.results ?? []) as any[];

  // Resolve all confirmation owners to citizen profiles in one batch.
  const owners = new Set<string>();
  for (const m of list) for (const c of m.confirmations ?? []) if (c.owner) owners.add(c.owner);
  const profiles = await resolveCitizenProfiles([...owners]);

  return list.map((m): MessageView => {
    const confirmations = m.confirmations?.length ?? 0;
    const signers: TxSigner[] = (m.confirmations ?? []).map((c: any) => {
      const p = profiles.get((c.owner ?? "").toLowerCase());
      return { address: c.owner, name: p?.name ?? "Mitsignierer", avatarUrl: p?.avatarUrl ?? null };
    });
    return {
      messageHash: m.messageHash,
      app: appNameFromOrigin(m.origin),
      text: typeof m.message === "string" ? m.message : "Strukturierte Signatur-Anfrage",
      confirmations,
      required,
      signers,
      date: m.created ?? null,
      fullySigned: confirmations >= required,
    };
  });
}

export async function addMessageConfirmation({
  messageHash,
  inner,
  ownerAddress,
  isSmart,
}: {
  messageHash: string;
  inner: string;
  ownerAddress: string;
  isSmart: boolean;
}): Promise<void> {
  const signature = await assembleSenderSignature({ inner, ownerAddress, isSmart });
  await getApiKit().addMessageSignature(messageHash, signature);
}
```
> Confirm against the installed api-kit v5 types: `getMessages(safeAddress)` returns `{ results: SafeMessage[] }` (or `{ count, results }`), each with `messageHash`, `message`, `origin`, `created`, `confirmations[].owner`; `getSafeInfo(safe).threshold`; `addMessageSignature(messageHash, signature)`. Adapt field access if names differ; `any[]` typing of results is acceptable.

- [ ] **Step 3: Create `messages/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { getPendingMessages } from "@/lib/gemeinschaftskasse/safe-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const items = await getPendingMessages();
    return NextResponse.json({ items });
  } catch (e) {
    return jsonError(e);
  }
}
```

- [ ] **Step 4: Create `confirm-message/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireAdmin, jsonError } from "@/lib/muenzen/api";
import { addMessageConfirmation } from "@/lib/gemeinschaftskasse/safe-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { messageHash, inner, ownerAddress, isSmart } = await req.json();
    if (!messageHash || !inner || !ownerAddress) {
      return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }
    await addMessageConfirmation({ messageHash, inner, ownerAddress, isSmart });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "gemeinschaftskasse/\(safe-server\|constants\)\|api/gemeinschaftskasse/\(messages\|confirm-message\)" || echo "NO ERRORS"`
Expected: `NO ERRORS`. (~431 pre-existing unrelated errors — ignore.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/gemeinschaftskasse/constants.ts apps/web/src/lib/gemeinschaftskasse/safe-server.ts apps/web/src/app/api/gemeinschaftskasse/messages/route.ts apps/web/src/app/api/gemeinschaftskasse/confirm-message/route.ts
git commit -m "feat(web): GK Safe-message backend — getPendingMessages + addMessageConfirmation + routes" -- apps/web/src/lib/gemeinschaftskasse/constants.ts apps/web/src/lib/gemeinschaftskasse/safe-server.ts apps/web/src/app/api/gemeinschaftskasse/messages/route.ts apps/web/src/app/api/gemeinschaftskasse/confirm-message/route.ts
```

---

### Task 2: Client `confirmMessage` + Anfragen tab UI

**Files:**
- Modify: `apps/web/src/lib/gemeinschaftskasse/safe-client.ts`
- Create: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Anfragen.tsx`

**Interfaces:**
- Consumes: `resolveSigner(account, wallet)` (existing, returns `{ownerAddress, isSmart, signingAccount}`), `postJson`, `useActiveAccount`/`useActiveWallet`, `useIsOwner` (existing hook), `approvalLabel` (format), `Avatar`/`AvatarImage`/`AvatarFallback`, `initials` (MemberRow), `HistorySkeleton` (skeletons).
- Produces: `confirmMessage({messageHash, account, wallet}): Promise<void>`; `<Anfragen />`.

- [ ] **Step 1: Add `confirmMessage` to `safe-client.ts`**

Append (the file already has `resolveSigner` + `postJson`):
```ts
/** Co-signs a pending Safe message (app signature-request). No execute step. */
export async function confirmMessage({
  messageHash,
  account,
  wallet,
}: {
  messageHash: string;
  account: Account;
  wallet: Wallet;
}): Promise<void> {
  const signer = await resolveSigner(account, wallet);
  if (!signer) throw new Error("Du bist kein Mitsignierer dieser Kasse.");
  const inner = await signer.signingAccount.signMessage({
    message: { raw: messageHash as `0x${string}` },
  });
  await postJson("/api/gemeinschaftskasse/confirm-message", {
    messageHash,
    inner,
    ownerAddress: signer.ownerAddress,
    isSmart: signer.isSmart,
  });
}
```

- [ ] **Step 2: Create `Anfragen.tsx`**

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import { useActiveAccount, useActiveWallet } from "thirdweb/react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { HistorySkeleton } from "./skeletons";
import { initials } from "./MemberRow";
import { approvalLabel } from "@/lib/gemeinschaftskasse/format";
import { confirmMessage } from "@/lib/gemeinschaftskasse/safe-client";
import { useIsOwner } from "./useIsOwner";

interface Signer { address: string; name: string; avatarUrl: string | null }
interface Msg {
  messageHash: string; app: string; text: string;
  confirmations: number; required: number; signers: Signer[];
  date: string | null; fullySigned: boolean;
}

export function Anfragen() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { isOwner } = useIsOwner();
  const [items, setItems] = useState<Msg[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch("/api/gemeinschaftskasse/messages")
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setItems(d.items)))
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  async function freigeben(m: Msg) {
    if (!account || !wallet) return;
    setBusy(m.messageHash);
    setActionErr((e) => ({ ...e, [m.messageHash]: "" }));
    try {
      await confirmMessage({ messageHash: m.messageHash, account, wallet });
      load();
    } catch (e) {
      setActionErr((s) => ({ ...s, [m.messageHash]: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  }

  if (err) return <p className="text-sm text-red-600">Fehler: {err}</p>;
  if (!items) return <HistorySkeleton rows={2} />;
  if (!items.length) return <p className="text-sm text-muted-foreground">Keine offenen Anfragen.</p>;

  const youSigned = (m: Msg) =>
    !!account && m.signers.some((s) => s.address.toLowerCase() === account.address.toLowerCase());

  return (
    <div className="space-y-4">
      {items.map((m) => (
        <div key={m.messageHash} className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{m.app}</p>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">„{m.text}"</p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{approvalLabel(m.confirmations, m.required)}</span>
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              {m.signers.length > 0 && (
                <span className="flex -space-x-1.5">
                  {m.signers.slice(0, 4).map((s) => (
                    <Avatar key={s.address} className="h-6 w-6 border border-background">
                      {s.avatarUrl && <AvatarImage src={s.avatarUrl} alt={s.name} />}
                      <AvatarFallback className="text-[9px]">{initials(s.name)}</AvatarFallback>
                    </Avatar>
                  ))}
                </span>
              )}
              {m.date && <span className="text-xs text-muted-foreground">{new Date(m.date).toLocaleDateString("de-DE")}</span>}
            </div>
            {isOwner && !m.fullySigned && !youSigned(m) && (
              <button
                onClick={() => freigeben(m)}
                disabled={busy === m.messageHash}
                className="px-3 py-1.5 text-sm rounded-md bg-[#00498B] text-white disabled:opacity-50"
              >
                {busy === m.messageHash ? "…" : "Freigeben"}
              </button>
            )}
            {youSigned(m) && !m.fullySigned && <span className="text-xs text-[#00498B]">Von dir freigegeben</span>}
            {m.fullySigned && <span className="text-xs text-green-700">Fertig signiert</span>}
          </div>
          {actionErr[m.messageHash] && <p className="text-xs text-red-600 mt-2">{actionErr[m.messageHash]}</p>}
        </div>
      ))}
    </div>
  );
}
```
> `HistorySkeleton` accepts a `rows` prop (default 5); passing `rows={2}` is fine. If `useIsOwner` returns a different shape, adapt the destructure (it returns `{ isOwner, loading }`).

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "gemeinschaftskasse/safe-client\|_components/Anfragen" || echo "NO ERRORS"`
Expected: `NO ERRORS`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/gemeinschaftskasse/safe-client.ts apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Anfragen.tsx
git commit -m "feat(web): GK Anfragen tab — co-sign app messages (Freigeben) + auto-refresh" -- apps/web/src/lib/gemeinschaftskasse/safe-client.ts apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Anfragen.tsx
```

---

### Task 3: Wire the Anfragen tab + badge into the page + transaction-queue auto-refresh

**Files:**
- Modify: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Tabs.tsx`
- Modify: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/page.tsx`
- Modify: `apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/PendingQueue.tsx`

**Interfaces:**
- Consumes: `<Anfragen />` (Task 2); `GET /api/gemeinschaftskasse/messages`.

- [ ] **Step 1: Add an optional badge to `Tabs.tsx`**

Read the current `Tabs.tsx` (it maps `tabs: string[]` to buttons). Add an optional `badges?: Record<string, number>` prop; when `badges[t] > 0`, render a small count pill after the label:
```tsx
export function Tabs({ tabs, active, onChange, badges }: { tabs: string[]; active: string; onChange: (t: string) => void; badges?: Record<string, number> }) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors flex items-center gap-1.5 ${
            active === t ? "border-[#00498B] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t}
          {badges && badges[t] > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#00498B] text-white text-[10px]">{badges[t]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the "Anfragen" tab + badge in `page.tsx`**

Read the current `page.tsx`. Add `"Anfragen"` to the `TABS` tuple (between "Auszahlungen" and "Mitglieder"), import + render `<Anfragen />` for that tab, and fetch the pending-message count (polling every 15s) for the badge:
```tsx
// add to imports
import { Anfragen } from "./_components/Anfragen";
// TABS tuple becomes:
const TABS = ["Übersicht", "Auszahlungen", "Anfragen", "Mitglieder", "Verlauf"] as const;
// inside the component, add badge state:
const [anfragenCount, setAnfragenCount] = useState(0);
useEffect(() => {
  const load = () =>
    fetch("/api/gemeinschaftskasse/messages")
      .then((r) => r.json())
      .then((d) => setAnfragenCount(Array.isArray(d.items) ? d.items.filter((m: { fullySigned: boolean }) => !m.fullySigned).length : 0))
      .catch(() => {});
  load();
  const id = setInterval(load, 15000);
  return () => clearInterval(id);
}, []);
// pass to Tabs: <Tabs tabs={TABS as unknown as string[]} active={tab} onChange={(t) => setTab(t as Tab)} badges={{ Anfragen: anfragenCount }} />
// render: {tab === "Anfragen" && <Anfragen />}
```
> Match the existing `page.tsx` patterns (it already has `useState`/`useEffect` imports or add them; `Tab` type union must include `"Anfragen"`).

- [ ] **Step 3: Add 15s auto-refresh to `PendingQueue.tsx`**

Read the current `PendingQueue.tsx`. It fetches `/pending` in a `useEffect`. Wrap the fetch in a `useCallback load` (if not already) and add an interval:
```tsx
useEffect(() => {
  load();
  const id = setInterval(load, 15000);
  return () => clearInterval(id);
}, [load]);
```
Keep all signing/execute/gating logic unchanged. (If the fetch is currently inline in the effect, extract it to a `load` callback first, preserving behavior.)

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "gemeinschaftskasse/_components/\(Tabs\|PendingQueue\)\|gemeinschaftskasse/page" || echo "NO ERRORS"`
Expected: `NO ERRORS`.

- [ ] **Step 5: Commit + push**

```bash
git add apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Tabs.tsx apps/web/src/app/admin/dashboard/gemeinschaftskasse/page.tsx apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/PendingQueue.tsx
git commit -m "feat(web): GK Anfragen tab wiring + badge + transaction-queue auto-refresh" -- apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/Tabs.tsx apps/web/src/app/admin/dashboard/gemeinschaftskasse/page.tsx apps/web/src/app/admin/dashboard/gemeinschaftskasse/_components/PendingQueue.tsx
git push
```

---

## Self-review against the spec

- **Anfragen tab shows pending Safe messages** → Tasks 1 (data) + 2 (UI) + 3 (tab). ✓
- **In-dashboard co-sign (Freigeben) via addMessageSignature, reusing assembleSenderSignature/resolveSigner** → Tasks 1 (`addMessageConfirmation`) + 2 (`confirmMessage` + button). ✓
- **App name from origin; string vs typed-data message text** → Task 1 (`appNameFromOrigin`, `text`). ✓
- **required = Safe threshold; signers resolved to citizens** → Task 1. ✓
- **Badge count of pending requests** → Task 3. ✓
- **Auto-refresh (15s) on Anfragen + transaction queue** → Tasks 2 (Anfragen) + 3 (PendingQueue). ✓
- **No execute step; non-owner gating; already-signed/ fully-signed states** → Task 2 UI. ✓
- **Server-side only; German; no raw 0x; no CRC** → enforced throughout. ✓

**External contracts to confirm during implementation (record in commits):**
1. api-kit v5 message API: `getMessages(safe) → {results}`, `getSafeInfo(safe).threshold`, `addMessageSignature(messageHash, signature)`, message fields `messageHash/message/origin/created/confirmations[].owner` (Task 1).
2. `useIsOwner` return shape `{ isOwner, loading }` (Task 2).
3. `HistorySkeleton` `rows` prop + `approvalLabel(n,m)` signature (Task 2).

## Controller verification (after build)
- Server-side live check: `GET`-equivalent of `getPendingMessages()` returns the Monerium message (app "Monerium", text "I hereby declare…", 1/2, signer resolved).
- **Browser (human):** the message appears in **Anfragen** at 1/2; a second owner clicks **Freigeben** → 2/2 → Monerium accepts (the live end-to-end co-sign test). New requests appear within ~15s without reload.
