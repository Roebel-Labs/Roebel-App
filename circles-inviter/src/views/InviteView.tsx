import { useCallback, useEffect, useMemo, useState } from "react";
import { sendTransactions } from "@aboutcircles/miniapp-sdk";
import { getAddress, isAddress, type Address } from "viem";
import { inviteFarm, getQuota, isHuman, toHostTxs, getSelfFundInfo, buildSelfFundTxs, type SelfFundInfo } from "../lib/circles";
import { ROEBEL_CITIZENS, shortAddr, explorerAvatar } from "../lib/citizens";
import { Card, ChartCard, PageHeader, KpiCard, Pill, Banner } from "../components/ui";
import { UserPlus, Wallet, Check, ExternalLink } from "../components/icons";

type RowStatus = "checking" | "registered" | "open" | "unknown";
type Msg = { kind: "ok" | "err" | "info"; text: string } | null;

const crc = (a: bigint) => (Number(a) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function InviteView({ inviter }: { inviter: Address | null }) {
  const [quota, setQuota] = useState<bigint | null>(null);
  const [selfFund, setSelfFund] = useState<SelfFundInfo | null>(null);
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const citizens = ROEBEL_CITIZENS;

  const loadQuota = useCallback(() => {
    if (!inviter) {
      setQuota(null);
      setSelfFund(null);
      return;
    }
    getQuota(inviter).then(setQuota).catch(() => setQuota(0n));
    getSelfFundInfo(inviter).then(setSelfFund).catch(() => setSelfFund(null));
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
  const registeredCount = citizens.filter((c) => status[c.address.toLowerCase()] === "registered").length;

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
      setMsg({ kind: "ok", text: `✓ Invited ${list.length} citizen(s). They now finish verifying in the Röbel app ("Join Röbel Coins").` });
      setExtra("");
      await refreshStatus();
      loadQuota();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }, [inviter, selectedList, extra, extraValid, refreshStatus, loadQuota]);

  const selfFundInvite = useCallback(async () => {
    if (!inviter || !selfFund) return;
    const list = selectedList.slice(0, selfFund.affordable);
    if (!list.length) return setMsg({ kind: "err", text: "Not enough CRC to self-fund (96 per invite). Select fewer, or unwrap more." });
    setBusy(true);
    setMsg({ kind: "info", text: `Unwrapping CRC + trusting ${list.length} citizen(s)…` });
    try {
      await sendTransactions(buildSelfFundTxs(selfFund, list));
      setMsg({
        kind: "ok",
        text: `✓ Self-funded ${list.length} invite(s). Each citizen now registers in the Röbel app ("Join Röbel Coins") — 96 CRC burns from you per registration.`,
      });
      await refreshStatus();
      getSelfFundInfo(inviter).then(setSelfFund).catch(() => {});
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }, [inviter, selfFund, selectedList, refreshStatus]);

  return (
    <div className="space-y-4">
      <PageHeader title="Invite citizens" description="Bring verified Röbel citizens into Circles using your invitation quota." onRefresh={refreshStatus} />

      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Inviting as"
          value={inviter ? <span className="font-mono text-base">{shortAddr(inviter)}</span> : <span className="text-base text-amber-600">Connect</span>}
          sub={inviter ? "connected wallet" : "open in the Circles app"}
          tone={inviter ? "primary" : "warning"}
          icon={<Wallet className="h-5 w-5" />}
        />
        <KpiCard
          label="Quota"
          value={quotaNum == null ? "…" : quotaNum}
          sub="invites available"
          tone={quotaNum ? "success" : "muted"}
          icon={<UserPlus className="h-5 w-5" />}
        />
      </div>

      {quotaNum === 0 && (
        <Banner kind="info">
          No quota yet. Share your Circles address with the Gnosis team to get quota assigned — your invites will appear here once
          it's set. You can still self-fund below.
        </Banner>
      )}

      <ChartCard
        title={`Citizens (${citizens.length})`}
        subtitle={`${registeredCount} verified · ${citizens.length - registeredCount} invitable`}
      >
        <ul className="-mx-1 divide-y divide-border">
          {citizens.map((c) => {
            const st = status[c.address.toLowerCase()] ?? "checking";
            const checked = selected.has(c.address.toLowerCase());
            const disabled = st === "registered";
            return (
              <li key={c.address}>
                <label className={`flex items-center gap-3 px-1 py-2.5 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    className="h-[18px] w-[18px] shrink-0 accent-[#194383]"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(c.address)}
                  />
                  <img src={explorerAvatar(c.address)} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-full border border-border bg-muted object-cover" />
                  <div className="min-w-0 flex-1">
                    <a href={explorerAvatar(c.address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[13px] text-foreground hover:text-[#194383]">
                      {shortAddr(c.address)}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  </div>
                  {c.attester && <Pill tone="primary">Attester</Pill>}
                  <StatusBadge status={st} />
                </label>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 border-t border-border pt-3">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Additional address (optional)</label>
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
            className="mt-1.5 w-full rounded-[10px] border border-border bg-card px-3 py-2 font-mono text-sm outline-none transition focus:border-[#194383] focus:ring-2 focus:ring-[#194383]/15"
          />
          {extra && !extraValid && <p className="mt-1 text-xs text-red-500">Not a valid address.</p>}
        </div>
      </ChartCard>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">
          Selected <strong className="text-foreground">{inviteCount}</strong>
          {quotaNum != null && <> · quota {quotaNum}</>}
        </span>
        <button
          onClick={invite}
          disabled={busy || !inviter || inviteCount === 0 || !!overQuota}
          className="inline-flex items-center gap-2 rounded-[12px] bg-[#194383] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(25,67,131,0.9)] transition hover:bg-[#1d4e99] active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          <UserPlus className="h-4 w-4" />
          {busy ? "Inviting…" : `Invite (${inviteCount})`}
        </button>
      </div>
      {overQuota && <p className="-mt-2 text-xs text-amber-600">More selected than your quota — please reduce the selection.</p>}

      {inviter && selfFund && (
        <Card className="p-3.5">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-[#194383]" />
            <span className="text-[13px] font-semibold text-foreground">Self-fund — no quota needed</span>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            Uses your own CRC (96 per invite). You have {crc(selfFund.rawAtto)} raw + {crc(selfFund.wrappedAtto)} wrapped → funds{" "}
            <strong className="text-foreground">{selfFund.affordable}</strong> invite(s). Citizens then register in the Röbel app.
          </p>
          <button
            onClick={selfFundInvite}
            disabled={busy || selfFund.affordable === 0 || selectedList.length === 0}
            className="mt-2.5 w-full rounded-[10px] border border-[#194383] bg-card px-4 py-2.5 text-sm font-semibold text-[#194383] transition hover:bg-[#194383]/5 active:scale-[0.99] disabled:opacity-40"
          >
            {busy ? "Working…" : `Self-fund invite (${Math.min(selectedList.length, selfFund.affordable)})`}
          </button>
        </Card>
      )}

      {msg && <Banner kind={msg.kind === "ok" ? "ok" : msg.kind === "err" ? "err" : "info"}>{msg.text}</Banner>}
    </div>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  if (status === "registered")
    return (
      <Pill tone="success">
        <Check className="h-3 w-3" /> verified
      </Pill>
    );
  if (status === "open") return <Pill tone="muted">invitable</Pill>;
  if (status === "unknown") return <span className="text-[11px] text-muted-foreground">?</span>;
  return <span className="text-[11px] text-muted-foreground/60">…</span>;
}
