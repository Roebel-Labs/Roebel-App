import { useCallback, useEffect, useMemo, useState } from "react";
import { sendTransactions } from "@aboutcircles/miniapp-sdk";
import { getAddress, isAddress, type Address } from "viem";
import { inviteFarm, getQuota, getQuotaFunding, isHuman, toHostTxs, getSelfFundInfo, buildSelfFundTxs, type SelfFundInfo, type QuotaFunding } from "../lib/circles";
import { ROEBEL_CITIZENS, shortAddr, explorerAvatar, type Citizen } from "../lib/citizens";
import { getProfiles, type Profile } from "../lib/circlesData";
import { Card, ChartCard, PageHeader, KpiCard, Pill, Banner, Avatar } from "../components/ui";
import { UserPlus, Wallet, Check, ExternalLink, ChevronRight } from "../components/icons";
import { track } from "../lib/analytics";

type RowStatus = "checking" | "registered" | "open" | "unknown";
type Msg = { kind: "ok" | "err" | "info"; text: string } | null;

const crc = (a: bigint) => (Number(a) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 });

export default function InviteView({ inviter }: { inviter: Address | null }) {
  const [quota, setQuota] = useState<bigint | null>(null);
  const [funding, setFunding] = useState<QuotaFunding | null>(null);
  const [selfFund, setSelfFund] = useState<SelfFundInfo | null>(null);
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [invitedOpen, setInvitedOpen] = useState(false);

  const citizens = ROEBEL_CITIZENS;

  // Resolve each citizen's real Circles avatar name + picture once (static list).
  useEffect(() => {
    getProfiles(citizens.map((c) => c.address)).then(setProfiles).catch(() => {});
  }, [citizens]);

  const loadQuota = useCallback(() => {
    if (!inviter) {
      setQuota(null);
      setFunding(null);
      setSelfFund(null);
      return;
    }
    getQuota(inviter).then(setQuota).catch(() => setQuota(0n));
    getQuotaFunding(inviter).then(setFunding).catch(() => setFunding(null));
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
  const fundable = funding?.fundableInvites ?? null;
  const overFunded = fundable != null && inviteCount > fundable;
  const quotaUnfunded = funding != null && quotaNum != null && quotaNum > 0 && funding.fundableInvites < quotaNum;
  const registeredCount = citizens.filter((c) => status[c.address.toLowerCase()] === "registered").length;
  // Split into the actionable list (not yet in Circles) and the already-invited
  // ones (registered humans) — the latter collapse into their own section.
  const invitable = useMemo(() => citizens.filter((c) => status[c.address.toLowerCase()] !== "registered"), [citizens, status]);
  const invited = useMemo(() => citizens.filter((c) => status[c.address.toLowerCase()] === "registered"), [citizens, status]);

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
      track("invite_sent", { count: list.length });
      setExtra("");
      await refreshStatus();
      loadQuota();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const reverted = /revert|simulation|insufficient|0x"|reason: 0x/i.test(raw);
      setMsg({
        kind: "err",
        text: reverted
          ? "The invite reverted on-chain — your quota isn't funded (the invitation pool is empty). Use Self-fund below, or ask the pool funder to top up the farm."
          : raw,
      });
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
      track("self_fund_sent", { count: list.length });
      await refreshStatus();
      getSelfFundInfo(inviter).then(setSelfFund).catch(() => {});
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }, [inviter, selfFund, selectedList, refreshStatus]);

  const renderCitizen = (c: Citizen, selectable: boolean) => {
    const key = c.address.toLowerCase();
    const st = status[key] ?? "checking";
    const p = profiles.get(key);
    const name = p?.name || shortAddr(c.address);
    return (
      <li key={c.address}>
        <label className={`flex items-center gap-3 px-1 py-2.5 ${selectable ? "cursor-pointer" : "opacity-70"}`}>
          {selectable ? (
            <input
              type="checkbox"
              className="h-[18px] w-[18px] shrink-0 accent-[#194383]"
              checked={selected.has(key)}
              onChange={() => toggle(c.address)}
            />
          ) : (
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#194383] text-white">
              <Check className="h-2.5 w-2.5" />
            </span>
          )}
          <Avatar address={c.address} name={p?.name ?? null} imageUrl={p?.imageUrl ?? null} size={28} />
          <div className="min-w-0 flex-1">
            <a
              href={explorerAvatar(c.address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-[13px] font-medium text-foreground hover:text-[#194383]"
            >
              <span className="truncate">{name}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            </a>
          </div>
          {c.attester && <Pill tone="primary">Attester</Pill>}
          <StatusBadge status={st} />
        </label>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Invite citizens" description="Bring verified Röbel citizens into Circles using your invitation quota." onRefresh={refreshStatus} />

      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Inviting as"
          value={inviter ? <span className="font-mono text-base">{shortAddr(inviter)}</span> : <span className="text-base text-muted-foreground">Connect</span>}
          sub={inviter ? "connected wallet" : "open in the Circles app"}
          tone={inviter ? "primary" : "warning"}
          icon={<Wallet className="h-5 w-5" />}
        />
        <KpiCard
          label="Quota"
          value={quotaNum == null ? "…" : quotaNum}
          sub={funding == null ? "invites available" : fundable! < (quotaNum ?? 0) ? `${fundable} funded on-chain` : "invites available"}
          tone={quotaNum ? (funding && fundable === 0 ? "warning" : "success") : "muted"}
          icon={<UserPlus className="h-5 w-5" />}
        />
      </div>

      {quotaNum === 0 && (
        <Banner kind="info">
          No quota yet. Share your Circles address with the Gnosis team to get quota assigned — your invites will appear here once
          it's set. You can still self-fund below.
        </Banner>
      )}

      {quotaUnfunded && (
        <Banner kind="warn">
          Your quota ({quotaNum}) isn't funded on-chain yet — the invitation pool is empty, so a quota invite would revert.{" "}
          {selfFund && selfFund.affordable > 0 ? (
            <>
              Use <strong>Self-fund</strong> below ({selfFund.affordable} from your own CRC).
            </>
          ) : (
            <>Ask the pool funder to top up the farm.</>
          )}
        </Banner>
      )}

      <ChartCard
        title={`Citizens (${citizens.length})`}
        subtitle={`${invitable.length} invitable · ${registeredCount} invited`}
      >
        {invitable.length === 0 ? (
          <p className="px-1 py-3 text-center text-[13px] text-muted-foreground">All citizens are already in Circles 🎉</p>
        ) : (
          <ul className="-mx-1 divide-y divide-border">{invitable.map((c) => renderCitizen(c, true))}</ul>
        )}

        {invited.length > 0 && (
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => setInvitedOpen((o) => !o)}
              aria-expanded={invitedOpen}
              className="flex w-full items-center gap-2 px-1 py-2.5 text-left transition hover:opacity-80"
            >
              <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${invitedOpen ? "rotate-90" : ""}`} />
              <span className="text-[13px] font-medium text-foreground">Invited</span>
              <Pill tone="success">
                <Check className="h-3 w-3" />
                {invited.length}
              </Pill>
              {!invitedOpen && (
                <span className="ml-auto flex -space-x-2 pr-0.5">
                  {invited.slice(0, 5).map((c) => {
                    const p = profiles.get(c.address.toLowerCase());
                    return (
                      <Avatar key={c.address} address={c.address} name={p?.name ?? null} imageUrl={p?.imageUrl ?? null} size={22} className="ring-2 ring-card" />
                    );
                  })}
                  {invited.length > 5 && (
                    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground ring-2 ring-card">
                      +{invited.length - 5}
                    </span>
                  )}
                </span>
              )}
            </button>
            {invitedOpen && <ul className="-mx-1 divide-y divide-border">{invited.map((c) => renderCitizen(c, false))}</ul>}
          </div>
        )}

        <div className="mt-3 border-t border-border pt-3">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Additional address (optional)</label>
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
            className="mt-1.5 w-full rounded-[10px] border border-border bg-card px-3 py-2 font-mono text-sm outline-none transition focus:border-[#194383] focus:ring-2 focus:ring-[#194383]/15"
          />
          {extra && !extraValid && <p className="mt-1 text-xs font-medium text-foreground">Not a valid address.</p>}
        </div>
      </ChartCard>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">
          Selected <strong className="text-foreground">{inviteCount}</strong>
          {quotaNum != null && <> · quota {quotaNum}</>}
        </span>
        <button
          onClick={invite}
          disabled={busy || !inviter || inviteCount === 0 || !!overQuota || !!overFunded}
          className="inline-flex items-center gap-2 rounded-[10px] bg-[#194383] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1d4e99] active:scale-[0.98] disabled:opacity-40"
        >
          <UserPlus className="h-4 w-4" />
          {busy ? "Inviting…" : `Invite (${inviteCount})`}
        </button>
      </div>
      {overQuota && <p className="-mt-2 text-xs text-muted-foreground">More selected than your quota — please reduce the selection.</p>}
      {!overQuota && overFunded && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Only {fundable} of your quota {fundable === 0 ? "is" : "are"} funded on-chain — use Self-fund below{fundable! > 0 ? ", or reduce the selection" : ""}.
        </p>
      )}

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
