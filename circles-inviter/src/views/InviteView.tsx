import { useCallback, useEffect, useMemo, useState } from "react";
import { sendTransactions } from "@aboutcircles/miniapp-sdk";
import { getAddress, isAddress, type Address } from "viem";
import { inviteFarm, getQuota, isHuman, toHostTxs } from "../lib/circles";
import { ROEBEL_CITIZENS, shortAddr } from "../lib/citizens";
import { Stat, Banner } from "../components/ui";

type RowStatus = "checking" | "registered" | "open" | "unknown";
type Msg = { kind: "ok" | "err" | "info"; text: string } | null;

export default function InviteView({ inviter }: { inviter: Address | null }) {
  const [quota, setQuota] = useState<bigint | null>(null);
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const citizens = ROEBEL_CITIZENS;

  const loadQuota = useCallback(() => {
    if (!inviter) return setQuota(null);
    getQuota(inviter).then(setQuota).catch(() => setQuota(0n));
  }, [inviter]);
  useEffect(loadQuota, [loadQuota]);

  const refreshStatus = useCallback(async () => {
    const entries = await Promise.all(
      citizens.map(async (c) => {
        try {
          return [c.address.toLowerCase(), (await isHuman(c.address)) ? "registered" : "open"] as const;
        } catch {
          return [c.address.toLowerCase(), "unknown"] as const;
        }
      }),
    );
    const next = Object.fromEntries(entries) as Record<string, RowStatus>;
    setStatus(next);
    setSelected(new Set(citizens.filter((c) => next[c.address.toLowerCase()] !== "registered").map((c) => c.address.toLowerCase())));
  }, [citizens]);
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const toggle = (addr: string) =>
    setSelected((s) => {
      const n = new Set(s);
      const k = addr.toLowerCase();
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const selectedList = useMemo(() => Array.from(selected).map((a) => getAddress(a) as Address), [selected]);
  const extraValid = extra.trim() !== "" && isAddress(extra.trim());
  const inviteCount = selectedList.length + (extraValid ? 1 : 0);
  const quotaNum = quota == null ? null : Number(quota);
  const overQuota = quotaNum != null && inviteCount > quotaNum;

  const invite = useCallback(async () => {
    if (!inviter) return setMsg({ kind: "err", text: "No wallet connected — open this app inside the Circles app." });
    const list = [...selectedList];
    if (extraValid) list.push(getAddress(extra.trim()) as Address);
    if (!list.length) return setMsg({ kind: "err", text: "No addresses selected." });

    setBusy(true);
    setMsg({ kind: "info", text: `Building invitations for ${list.length} address(es)…` });
    try {
      const { transactions } = await inviteFarm.generateInvites(inviter, list);
      setMsg({ kind: "info", text: "Please confirm in your wallet…" });
      await sendTransactions(toHostTxs(transactions as { to: string; data: string; value?: bigint }[]));
      setMsg({ kind: "ok", text: `✓ Invited ${list.length} citizen(s). They now finish verifying in the Röbel app ("Join Röbel-Taler").` });
      setExtra("");
      await refreshStatus();
      loadQuota();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }, [inviter, selectedList, extra, extraValid, refreshStatus, loadQuota]);

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">Invite verified Röbel citizens into Circles — using your invitation quota.</p>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Inviting as">
          {inviter ? (
            <span className="font-mono text-sm text-slate-800">{shortAddr(inviter)}</span>
          ) : (
            <span className="text-sm text-amber-600">Open in the Circles app</span>
          )}
        </Stat>
        <Stat label="Available quota">
          <span className={`text-lg font-semibold ${quotaNum ? "text-navy" : "text-slate-400"}`}>{quotaNum == null ? "…" : quotaNum}</span>
        </Stat>
      </div>

      {quotaNum === 0 && (
        <Banner kind="info">
          No quota yet. Share your Circles address with the Gnosis team to get quota assigned — your invites will appear here
          once it's set.
        </Banner>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white mt-1">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-medium text-slate-700">Citizens ({citizens.length})</span>
          <button onClick={refreshStatus} className="text-xs text-navy hover:underline">
            Refresh status
          </button>
        </div>
        <ul className="divide-y divide-slate-100">
          {citizens.map((c) => {
            const st = status[c.address.toLowerCase()] ?? "checking";
            const checked = selected.has(c.address.toLowerCase());
            const disabled = st === "registered";
            return (
              <li key={c.address} className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" className="h-4 w-4 accent-[#194383]" checked={checked} disabled={disabled} onChange={() => toggle(c.address)} />
                <span className="font-mono text-xs text-slate-700 flex-1">{shortAddr(c.address)}</span>
                {c.attester && <span className="text-[10px] rounded-full bg-navy/10 text-navy px-2 py-0.5">Attester</span>}
                <StatusBadge status={st} />
              </li>
            );
          })}
        </ul>
        <div className="px-4 py-3 border-t border-slate-100">
          <label className="text-xs text-slate-500">Additional address (optional)</label>
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-navy"
          />
          {extra && !extraValid && <p className="mt-1 text-xs text-red-500">Not a valid address.</p>}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-slate-500">
          Selected: <strong className="text-slate-800">{inviteCount}</strong>
          {quotaNum != null && <> · Quota: {quotaNum}</>}
        </span>
        <button
          onClick={invite}
          disabled={busy || !inviter || inviteCount === 0 || !!overQuota}
          className="rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-40 hover:bg-navy-600"
        >
          {busy ? "Inviting…" : `Invite (${inviteCount})`}
        </button>
      </div>
      {overQuota && <p className="mt-2 text-xs text-amber-600">More selected than your quota — please reduce the selection.</p>}

      {msg && (
        <Banner kind={msg.kind} className="mt-4">
          {msg.text}
        </Banner>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  if (status === "registered") return <span className="text-[11px] rounded-full bg-green-100 text-green-700 px-2 py-0.5">✓ verified</span>;
  if (status === "open") return <span className="text-[11px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">invitable</span>;
  if (status === "unknown") return <span className="text-[11px] text-slate-400">?</span>;
  return <span className="text-[11px] text-slate-300">…</span>;
}
