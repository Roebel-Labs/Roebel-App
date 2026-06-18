import { useCallback, useEffect, useMemo, useState } from "react";
import { onWalletChange, sendTransactions } from "@aboutcircles/miniapp-sdk";
import { getAddress, isAddress, type Address } from "viem";
import { inviteFarm, getQuota, isHuman, toHostTxs } from "./lib/circles";
import { ROEBEL_CITIZENS, shortAddr } from "./lib/citizens";

type RowStatus = "checking" | "registered" | "open" | "unknown";
type Msg = { kind: "ok" | "err" | "info"; text: string } | null;

export default function App() {
  const [inviter, setInviter] = useState<Address | null>(null);
  const [quota, setQuota] = useState<bigint | null>(null);
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const citizens = ROEBEL_CITIZENS;

  // The Circles host injects the connected wallet (your passkey account).
  useEffect(() => {
    const ret = onWalletChange((addr: string | null) => {
      setInviter(addr && isAddress(addr) ? getAddress(addr) : null);
    });
    return () => {
      if (typeof ret === "function") (ret as () => void)();
    };
  }, []);

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
    // Pre-select everyone not yet registered.
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
    if (!inviter) return setMsg({ kind: "err", text: "Keine Wallet verbunden — öffne diese App in der Circles-App." });
    const list = [...selectedList];
    if (extraValid) list.push(getAddress(extra.trim()) as Address);
    if (!list.length) return setMsg({ kind: "err", text: "Keine Adressen ausgewählt." });

    setBusy(true);
    setMsg({ kind: "info", text: `Baue Einladungen für ${list.length} Adresse(n)…` });
    try {
      const { transactions } = await inviteFarm.generateInvites(inviter, list);
      setMsg({ kind: "info", text: "Bitte in deiner Wallet bestätigen…" });
      await sendTransactions(toHostTxs(transactions as { to: string; data: string; value?: bigint }[]));
      setMsg({
        kind: "ok",
        text: `✓ ${list.length} Bürger eingeladen. Sie verifizieren sich jetzt in der Röbel-App ("Bei Röbel-Taler mitmachen").`,
      });
      setExtra("");
      await refreshStatus();
      loadQuota();
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setMsg({ kind: "err", text });
    } finally {
      setBusy(false);
    }
  }, [inviter, selectedList, extra, extraValid, refreshStatus, loadQuota]);

  return (
    <div className="min-h-full flex justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        {/* Header */}
        <header className="mb-5">
          <h1 className="text-2xl font-bold text-navy">Bürger einladen</h1>
          <p className="text-sm text-slate-500">
            Lade verifizierte Röbel-Bürger in Circles ein — über dein Einladungs-Kontingent (Quota).
          </p>
        </header>

        {/* Connection + quota */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Stat label="Eingeladen von">
            {inviter ? (
              <span className="font-mono text-sm text-slate-800">{shortAddr(inviter)}</span>
            ) : (
              <span className="text-sm text-amber-600">In Circles-App öffnen</span>
            )}
          </Stat>
          <Stat label="Verfügbare Quota">
            <span className={`text-lg font-semibold ${quotaNum ? "text-navy" : "text-slate-400"}`}>
              {quotaNum == null ? "…" : quotaNum}
            </span>
          </Stat>
        </div>

        {quotaNum === 0 && (
          <Banner kind="info">
            Noch keine Quota. Teile deine Circles-Adresse mit dem Gnosis-Team, um Quota zugewiesen zu
            bekommen — danach erscheinen hier deine Einladungen.
          </Banner>
        )}

        {/* Citizen list */}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-medium text-slate-700">Bürger ({citizens.length})</span>
            <button onClick={refreshStatus} className="text-xs text-navy hover:underline">
              Status aktualisieren
            </button>
          </div>
          <ul className="divide-y divide-slate-100">
            {citizens.map((c) => {
              const st = status[c.address.toLowerCase()] ?? "checking";
              const checked = selected.has(c.address.toLowerCase());
              const disabled = st === "registered";
              return (
                <li key={c.address} className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#194383]"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(c.address)}
                  />
                  <span className="font-mono text-xs text-slate-700 flex-1">{shortAddr(c.address)}</span>
                  {c.attester && (
                    <span className="text-[10px] rounded-full bg-navy/10 text-navy px-2 py-0.5">Attester</span>
                  )}
                  <StatusBadge status={st} />
                </li>
              );
            })}
          </ul>

          {/* Extra address */}
          <div className="px-4 py-3 border-t border-slate-100">
            <label className="text-xs text-slate-500">Weitere Adresse (optional)</label>
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value.trim())}
              placeholder="0x…"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-navy"
            />
            {extra && !extraValid && <p className="mt-1 text-xs text-red-500">Keine gültige Adresse.</p>}
          </div>
        </div>

        {/* Action */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm text-slate-500">
            Ausgewählt: <strong className="text-slate-800">{inviteCount}</strong>
            {quotaNum != null && <> · Quota: {quotaNum}</>}
          </span>
          <button
            onClick={invite}
            disabled={busy || !inviter || inviteCount === 0 || !!overQuota}
            className="rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-40 hover:bg-navy-600"
          >
            {busy ? "Lädt ein…" : `Einladen (${inviteCount})`}
          </button>
        </div>
        {overQuota && (
          <p className="mt-2 text-xs text-amber-600">Mehr ausgewählt als Quota — bitte Auswahl reduzieren.</p>
        )}

        {msg && (
          <Banner kind={msg.kind} className="mt-4">
            {msg.text}
          </Banner>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-slate-400">
          „Einladen“ vertraut die Adressen über dein Quota (kein eigenes Guthaben nötig). Bereits
          registrierte Bürger werden übersprungen. Danach schließt jeder die Verifizierung in der
          Röbel-App ab (registerHuman).
        </p>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  if (status === "registered")
    return <span className="text-[11px] rounded-full bg-green-100 text-green-700 px-2 py-0.5">✓ verifiziert</span>;
  if (status === "open")
    return <span className="text-[11px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">einladbar</span>;
  if (status === "unknown") return <span className="text-[11px] text-slate-400">?</span>;
  return <span className="text-[11px] text-slate-300">…</span>;
}

function Banner({
  kind,
  children,
  className = "",
}: {
  kind: "ok" | "err" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  const tone =
    kind === "ok"
      ? "border-green-200 bg-green-50 text-green-800"
      : kind === "err"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tone} ${className}`}>{children}</div>;
}
