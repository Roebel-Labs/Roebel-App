"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useActiveAccount } from "thirdweb/react";
import {
  prepareContractCall,
  readContract,
  sendTransaction,
  waitForReceipt,
} from "thirdweb";
import { client } from "@/app/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getContract } from "thirdweb";
import { base } from "thirdweb/chains";
import { maciGovernorContract, basescanTx, MACI_INFRA } from "@/lib/maci-config";

const FOUNDER_ALLOWLIST = new Set(
  ["0xc49de63ccfee46c6c5c3e393293f66779799fb28"].map((a) => a.toLowerCase())
);

type ProposalRow = {
  proposal_id: string;
  blockchain_proposal_id: string;
  title: string;
  proposer_address: string;
  transaction_hash: string;
  created_at: string;
  category: string | null;
};

type LiveState = {
  state: number;
  forVotes: string;
  againstVotes: string;
  abstainVotes: string;
  voteStartTs: number | null;
  voteEndTs: number | null;
  eta: number | null;
  tallyAddress: string | null;
  isTallied: boolean | null;
  totalTallyResults: string | null;
};

type ProposalActionData = {
  targets: string[];
  values: string[];
  calldatas: string[];
  description: string;
  descriptionHash: string;
};

/**
 * Decode OZ Governor's custom revert errors into something a human can act
 * on. The one that hits this page in practice is GovernorUnexpectedProposalState
 * — fired when you queue a Succeeded proposal that's already been queued
 * (state 5), or execute a Queued proposal that hasn't passed its Timelock
 * delay. The raw error reads as a 200-char hex blob, so we map it to a
 * short German sentence.
 */
function decodeRevertReason(err: unknown): string | null {
  const text = err instanceof Error ? err.message : String(err);
  const match = text.match(
    /GovernorUnexpectedProposalState[^,]*,\s*(\d+)\s*,/
  );
  if (match) {
    const current = Number(match[1]);
    const stateName: Record<number, string> = {
      0: "Ausstehend",
      1: "Aktiv",
      2: "Abgebrochen",
      3: "Abgelehnt",
      4: "Angenommen",
      5: "In Timelock (bereits gequeued)",
      6: "Abgelaufen",
      7: "Ausgeführt",
    };
    return `Aktion fehlgeschlagen — der Vorschlag ist bereits im Zustand „${stateName[current] ?? `?${current}`}". Lade die Seite neu, um die aktuelle Aktion zu sehen.`;
  }
  return null;
}

const STATE_LABELS: Record<number, { label: string; tone: "neutral" | "amber" | "red" | "green" | "blue" }> = {
  [-1]: { label: "Anderer Governor", tone: "neutral" },
  0: { label: "Ausstehend", tone: "neutral" },
  1: { label: "Aktiv", tone: "blue" },
  2: { label: "Abgebrochen", tone: "red" },
  3: { label: "Abgelehnt", tone: "red" },
  4: { label: "Angenommen", tone: "green" },
  5: { label: "In Timelock", tone: "amber" },
  6: { label: "Abgelaufen", tone: "neutral" },
  7: { label: "Ausgeführt", tone: "green" },
};

function StateBadge({ state }: { state: number | null }) {
  if (state === null) return <Badge variant="outline">…</Badge>;
  const info = STATE_LABELS[state] ?? { label: `?${state}`, tone: "neutral" as const };
  const tone =
    info.tone === "green"
      ? "bg-green-600 text-white hover:bg-green-700"
      : info.tone === "red"
      ? "bg-red-600 text-white hover:bg-red-700"
      : info.tone === "amber"
      ? "bg-amber-500 text-white hover:bg-amber-600"
      : info.tone === "blue"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "bg-muted text-foreground";
  return <Badge className={tone}>{info.label}</Badge>;
}

export default function AdminProposalsPage() {
  const account = useActiveAccount();
  const isFounder =
    !!account && FOUNDER_ALLOWLIST.has(account.address.toLowerCase());

  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [liveState, setLiveState] = useState<Record<string, LiveState>>({});
  const [actionData, setActionData] = useState<Record<string, ProposalActionData>>({});
  // Map of proposal_id → "this proposal has no executable action" so we can
  // hide Execute and render an explanation instead of letting the user
  // click into a GovernorDisabledDeposit revert. Populated lazily as soon
  // as the proposal hits the queue stage and we fetch its action data.
  const [isNoop, setIsNoop] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [flyStatus, setFlyStatus] = useState<{
    ready: boolean;
    scanInFlight: boolean;
    lastRun: {
      pollId: string;
      status: string;
      startedAt: string;
      finishedAt: string | null;
      tallyFile?: string;
      error?: string;
    } | null;
    lastScan: { startedAt: string; finishedAt: string | null } | null;
  } | null>(null);


  const refreshProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/proposals/list?limit=20&orderBy=created_at&orderDirection=desc",
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      setProposals(json.proposals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProposals();
  }, [refreshProposals]);

  // Poll Fly /status every 10 s so the user sees the scan + tally progress
  // without leaving this page.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/coordinator/status", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setFlyStatus(json);
      } catch {
        // ignore — keep prior status
      }
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Fetch live state + votes from the Governor (and Tally contract if the
  // proposal has reached the tally stage) for a single proposal. Each
  // read is wrapped in its own try/catch so a single revert (e.g. proposal
  // belongs to an archived Governor, or MACI Governor's proposalVotes
  // override reverts because votes live on the Tally contract instead)
  // doesn't block the rest of the row.
  const fetchLiveStateFor = useCallback(
    async (p: ProposalRow): Promise<LiveState | null> => {
      let id: bigint;
      try {
        id = BigInt(p.blockchain_proposal_id);
      } catch {
        return null;
      }

      const readGovOrNull = async <T,>(method: string): Promise<T | null> => {
        try {
          return (await readContract({
            contract: maciGovernorContract,
            method,
            params: [id],
          } as Parameters<typeof readContract>[0])) as T;
        } catch {
          return null;
        }
      };

      const [stateRaw, snapshot, deadline, eta, pollId] = await Promise.all([
        readGovOrNull<number | bigint>(
          "function state(uint256) view returns (uint8)"
        ),
        readGovOrNull<bigint>(
          "function proposalSnapshot(uint256) view returns (uint256)"
        ),
        readGovOrNull<bigint>(
          "function proposalDeadline(uint256) view returns (uint256)"
        ),
        readGovOrNull<bigint>(
          "function proposalEta(uint256) view returns (uint256)"
        ),
        readGovOrNull<bigint>(
          "function proposalPoll(uint256) view returns (uint256)"
        ),
      ]);

      // MaciAttesterGovernor stores the per-option vote counts on the
      // Tally contract, not on the Governor itself. Resolve the Tally
      // address via MACI.polls(pollId) → tally, then read totalTallyResults
      // (proves a tally has landed) plus tallyResults(voteOption) for
      // option 0/1/2 (against/for/abstain).
      let tallyAddress: string | null = null;
      let isTallied: boolean | null = null;
      let totalTallyResults: string | null = null;
      let forVotes = "0";
      let againstVotes = "0";
      let abstainVotes = "0";

      if (pollId !== null) {
        const maciCore = getContract({
          client,
          address: MACI_INFRA.maci,
          chain: base,
        });
        try {
          const polls = (await readContract({
            contract: maciCore,
            method:
              "function polls(uint256) view returns (address poll, address messageProcessor, address tally)",
            params: [pollId],
          } as Parameters<typeof readContract>[0])) as readonly [
            string,
            string,
            string,
          ];
          tallyAddress = polls[2];
        } catch {
          // ignore — older Governors may not expose proposalPoll
        }
      }

      if (tallyAddress) {
        const tallyContract = getContract({
          client,
          address: tallyAddress,
          chain: base,
        });
        const readTallyOrNull = async <T,>(method: string, params: unknown[] = []): Promise<T | null> => {
          try {
            return (await readContract({
              contract: tallyContract,
              method,
              params,
            } as Parameters<typeof readContract>[0])) as T;
          } catch {
            return null;
          }
        };
        const [tot, tallied, opt0, opt1, opt2] = await Promise.all([
          readTallyOrNull<bigint>(
            "function totalTallyResults() view returns (uint256)"
          ),
          readTallyOrNull<boolean>("function isTallied() view returns (bool)"),
          readTallyOrNull<readonly [boolean, bigint]>(
            "function tallyResults(uint256) view returns (bool isSet, uint256 value)",
            [0n]
          ),
          readTallyOrNull<readonly [boolean, bigint]>(
            "function tallyResults(uint256) view returns (bool isSet, uint256 value)",
            [1n]
          ),
          readTallyOrNull<readonly [boolean, bigint]>(
            "function tallyResults(uint256) view returns (bool isSet, uint256 value)",
            [2n]
          ),
        ]);
        if (tot !== null) totalTallyResults = tot.toString();
        if (tallied !== null) isTallied = tallied;
        if (opt0) againstVotes = opt0[1].toString();
        if (opt1) forVotes = opt1[1].toString();
        if (opt2) abstainVotes = opt2[1].toString();
      }

      return {
        state: stateRaw == null ? -1 : Number(stateRaw),
        forVotes,
        againstVotes,
        abstainVotes,
        voteStartTs: snapshot ? Number(snapshot) : null,
        voteEndTs: deadline ? Number(deadline) : null,
        eta: eta ? Number(eta) : null,
        tallyAddress,
        isTallied,
        totalTallyResults,
      };
    },
    []
  );

  // Hydrate every visible proposal's live state on mount + whenever the
  // proposal list changes. Sequential per row — public RPC endpoints
  // throttle fast bursts, and the data trickles in fast enough that the
  // user sees rows resolve one-by-one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, LiveState> = {};
      for (const p of proposals) {
        const live = await fetchLiveStateFor(p);
        if (cancelled) return;
        if (live) {
          next[p.proposal_id] = live;
          setLiveState({ ...next });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposals, fetchLiveStateFor]);

  const getActionData = useCallback(
    async (txHash: string): Promise<ProposalActionData> => {
      if (actionData[txHash]) return actionData[txHash];
      const res = await fetch(`/api/coordinator/proposal-action/${txHash}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setActionData((prev) => ({ ...prev, [txHash]: json }));
      return json;
    },
    [actionData]
  );

  // A proposal is "no-op" when its only action is a self-call with empty
  // calldata. Survey-style proposals (the citizen-poll path) end up here:
  // the vote IS the proposal, no contract action attached. OZ Governor's
  // receive() reverts with GovernorDisabledDeposit if anyone tries to
  // execute one — so we hide Execute and explain instead.
  const probeIsNoop = useCallback(
    async (p: ProposalRow) => {
      if (isNoop[p.proposal_id] !== undefined) return;
      try {
        const data = await getActionData(p.transaction_hash);
        const noop =
          data.calldatas.length === 1 &&
          (data.calldatas[0] === "0x" || data.calldatas[0] === "") &&
          data.values.every((v) => v === "0");
        setIsNoop((prev) => ({ ...prev, [p.proposal_id]: noop }));
      } catch {
        // ignore — we'll just leave the button visible
      }
    },
    [getActionData, isNoop]
  );

  // For any proposal that has reached the queue/execute window, probe
  // whether it's a no-op so the row UI can react.
  useEffect(() => {
    for (const p of proposals) {
      const live = liveState[p.proposal_id];
      if (live && (live.state === 4 || live.state === 5)) {
        probeIsNoop(p);
      }
    }
  }, [proposals, liveState, probeIsNoop]);


  // Shared logic for queue() + execute(). Same 4-tuple, same signer,
  // only the method selector differs. Using direct sendTransaction +
  // waitForReceipt instead of useSendTransaction's mutate — the hook's
  // callbacks were never firing in this page (no onSuccess, no onError,
  // no console activity), so we drop down to the explicit promise API
  // for a clean try/catch with full visibility.
  const runGovernorAction = useCallback(
    async (
      p: ProposalRow,
      action: "queue" | "execute",
      successMessage: (txHash: string) => string
    ) => {
      if (!account) return;
      setError(null);
      setFeedback(null);
      setBusyId(p.proposal_id);
      console.log(`[admin/proposals] ${action} clicked for`, p.proposal_id);
      try {
        const data = await getActionData(p.transaction_hash);
        console.log(`[admin/proposals] ${action} action-data:`, data);

        const tx =
          action === "queue"
            ? prepareContractCall({
                contract: maciGovernorContract,
                method:
                  "function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)",
                params: [
                  data.targets,
                  data.values.map((v) => BigInt(v)),
                  data.calldatas as `0x${string}`[],
                  data.descriptionHash as `0x${string}`,
                ],
              })
            : prepareContractCall({
                contract: maciGovernorContract,
                method:
                  "function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) payable returns (uint256)",
                params: [
                  data.targets,
                  data.values.map((v) => BigInt(v)),
                  data.calldatas as `0x${string}`[],
                  data.descriptionHash as `0x${string}`,
                ],
              });

        console.log(`[admin/proposals] ${action} sending tx…`);
        setFeedback(`${action === "queue" ? "Queue" : "Execute"}-Tx wird signiert + eingereicht…`);

        const result = await sendTransaction({ transaction: tx, account });
        console.log(`[admin/proposals] ${action} tx hash:`, result.transactionHash);

        setFeedback(
          `${action === "queue" ? "Queue" : "Execute"}-Tx eingereicht (${result.transactionHash.slice(0, 14)}…) — warte auf Confirmations…`
        );

        const receipt = await waitForReceipt({
          client,
          chain: maciGovernorContract.chain,
          transactionHash: result.transactionHash,
        });
        console.log(`[admin/proposals] ${action} receipt:`, receipt);

        if (receipt.status !== "success") {
          throw new Error(
            `tx reverted on-chain — receipt status: ${receipt.status}`
          );
        }

        setFeedback(successMessage(result.transactionHash));

        // Refresh THIS proposal's live state immediately so the badge/
        // buttons reflect reality without waiting for a manual refresh.
        const fresh = await fetchLiveStateFor(p);
        if (fresh) setLiveState((prev) => ({ ...prev, [p.proposal_id]: fresh }));
      } catch (err) {
        console.error(`[admin/proposals] ${action} FAILED`, err);
        setError(decodeRevertReason(err) ?? (err instanceof Error ? err.message : String(err)));
        // Even on failure, re-read state — the proposal may already be
        // in the next stage (race between our click and a parallel
        // queue/execute from another tab or the chain-listener).
        const fresh = await fetchLiveStateFor(p);
        if (fresh) setLiveState((prev) => ({ ...prev, [p.proposal_id]: fresh }));
      } finally {
        setBusyId(null);
      }
    },
    [account, getActionData, fetchLiveStateFor]
  );

  const handleQueue = useCallback(
    (p: ProposalRow) =>
      runGovernorAction(
        p,
        "queue",
        (h) =>
          `Queue-Tx bestätigt: ${h} — nach Timelock-Delay (1 h) erscheint der Execute-Button.`
      ),
    [runGovernorAction]
  );

  const handleExecute = useCallback(
    (p: ProposalRow) =>
      runGovernorAction(
        p,
        "execute",
        (h) =>
          `Execute-Tx bestätigt: ${h} — chain-listener flippt activated_at innerhalb 5 min.`
      ),
    [runGovernorAction]
  );

  const nowSec = useMemo(() => Math.floor(Date.now() / 1000), [liveState]);

  if (!account) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Vorschläge — Admin-Aktionen</CardTitle>
            <CardDescription>
              Bitte verbinde deine Wallet, um Tally, Queue und Execute auszulösen.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!isFounder) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Nur für Founder</CardTitle>
            <CardDescription className="text-red-800">
              Diese Seite ist nur für die Founder-Wallet sichtbar. Tally,
              Queue und Execute werden über diese Seite ausgelöst.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-foreground">
            Vorschläge — Admin-Aktionen
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tally auslösen, Vorschläge queuen, im Timelock freischalten und
            ausführen. Diese Aktionen liegen bewusst nicht auf der öffentlichen
            Vorschlagsseite.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshProposals} disabled={loading}>
            ↻ Aktualisieren
          </Button>
          <Link href="/admin/dashboard/coordinator">
            <Button variant="outline">← Coordinator</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Auszählung — Shamir 3-von-5</CardTitle>
              <CardDescription>
                Tallys laufen ausschließlich über den Shamir-Reconstructor.
                3 von 5 Bescheinigern müssen ihren Anteil einreichen, dann
                rekonstruiert der Coordinator den Schlüssel kurzzeitig im
                RAM und legt die Auszählung On-Chain ab.
              </CardDescription>
            </div>
            {flyStatus && (
              <div className="shrink-0 text-right text-xs">
                <div className="flex items-center gap-2 justify-end">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      flyStatus.scanInFlight
                        ? "bg-amber-500 animate-pulse"
                        : flyStatus.ready
                        ? "bg-green-500"
                        : "bg-red-500"
                    }`}
                  />
                  <span className="text-muted-foreground">
                    {flyStatus.scanInFlight
                      ? "Reconstructor läuft"
                      : flyStatus.ready
                      ? "Coordinator bereit"
                      : "Coordinator offline"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground">
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Nach Abstimmungsende den Poll auf{" "}
              <Link
                href="/admin/dashboard/coordinator"
                className="underline text-foreground hover:opacity-80"
              >
                Coordinator → Tally-Sessions
              </Link>{" "}
              öffnen (Poll-ID eintragen, &bdquo;Session öffnen&ldquo;).
            </li>
            <li>
              Die 5 Bescheiniger erhalten den Link
              <code className="font-mono mx-1">
                /admin/dashboard/coordinator/tally/&lt;pollId&gt;
              </code>
              und reichen ihren Anteil ein.
            </li>
            <li>
              Sobald 3 Anteile beim Reconstructor sind, läuft die
              Auszählung automatisch (≈10–15 min für Proof-Gen + Submit).
              Status erscheint live auf der Coordinator-Übersicht.
            </li>
          </ol>
          {flyStatus?.lastRun && (
            <div className="border-t border-border pt-3">
              <span className="font-medium text-foreground">
                Letzter Run:
              </span>{" "}
              Poll {flyStatus.lastRun.pollId} —{" "}
              <span
                className={
                  flyStatus.lastRun.status === "succeeded"
                    ? "text-green-700"
                    : flyStatus.lastRun.status === "failed"
                    ? "text-red-700"
                    : "text-amber-700"
                }
              >
                {flyStatus.lastRun.status}
              </span>{" "}
              ({new Date(flyStatus.lastRun.startedAt).toLocaleString("de-DE")})
            </div>
          )}
        </CardContent>
      </Card>

      {feedback && (
        <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded p-3">
          {feedback}
        </div>
      )}
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 break-all">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Letzte Vorschläge</CardTitle>
          <CardDescription>
            Status und Aktionen pro Vorschlag. State 1 (Aktiv) mit überschrittener
            Endzeit heißt: Tally fehlt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Lädt…</div>
          ) : proposals.length === 0 ? (
            <div className="text-sm text-muted-foreground">Keine Vorschläge.</div>
          ) : (
            <ul className="space-y-3">
              {proposals.map((p) => {
                const live = liveState[p.proposal_id];
                const votingEnded =
                  live?.voteEndTs != null && nowSec >= live.voteEndTs;
                const tallyPending = live?.state === 1 && votingEnded;
                const timelockReady =
                  live?.state === 5 &&
                  (live.eta == null || nowSec >= live.eta);
                return (
                  <li
                    key={p.proposal_id}
                    className="border border-border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <StateBadge state={live?.state ?? null} />
                          {tallyPending && (
                            <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                              Tally fehlt
                            </Badge>
                          )}
                          {live?.isTallied && live?.state !== 1 && (
                            <Badge className="bg-emerald-500 text-white hover:bg-emerald-600">
                              ✓ Ausgezählt
                            </Badge>
                          )}
                          {p.category && (
                            <Badge variant="outline">{p.category}</Badge>
                          )}
                        </div>
                        <h3 className="text-base font-medium text-foreground break-words">
                          {p.title}
                        </h3>
                        <div className="text-xs text-muted-foreground font-mono break-all mt-1">
                          {p.proposal_id}
                        </div>
                      </div>
                      <a
                        href={basescanTx(p.transaction_hash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline text-muted-foreground shrink-0"
                      >
                        propose-Tx ↗
                      </a>
                    </div>

                    {live && (
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="border border-border rounded p-2">
                          <div className="text-muted-foreground">Für</div>
                          <div className="font-mono">{live.forVotes}</div>
                        </div>
                        <div className="border border-border rounded p-2">
                          <div className="text-muted-foreground">Gegen</div>
                          <div className="font-mono">{live.againstVotes}</div>
                        </div>
                        <div className="border border-border rounded p-2">
                          <div className="text-muted-foreground">Enthaltung</div>
                          <div className="font-mono">{live.abstainVotes}</div>
                        </div>
                      </div>
                    )}

                    {live?.voteEndTs && (
                      <div className="text-xs text-muted-foreground">
                        Abstimmungsende:{" "}
                        {new Date(live.voteEndTs * 1000).toLocaleString("de-DE")}
                        {votingEnded ? " (vorbei)" : " (läuft)"}
                      </div>
                    )}

                    {live?.state === 5 && live.eta != null && (
                      <div className="text-xs text-muted-foreground">
                        Timelock-Freigabe:{" "}
                        {new Date(live.eta * 1000).toLocaleString("de-DE")}
                        {timelockReady ? " (jetzt ausführbar)" : " (warten)"}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-2">
                      {live?.state === 4 && (
                        <Button
                          onClick={() => handleQueue(p)}
                          disabled={busyId === p.proposal_id}
                        >
                          {busyId === p.proposal_id
                            ? "Queue läuft…"
                            : "In Warteschlange (Queue)"}
                        </Button>
                      )}
                      {live?.state === 5 && !isNoop[p.proposal_id] && (
                        <Button
                          onClick={() => handleExecute(p)}
                          disabled={busyId === p.proposal_id || !timelockReady}
                          title={
                            !timelockReady
                              ? "Erst nach Timelock-Delay ausführbar"
                              : undefined
                          }
                        >
                          {busyId === p.proposal_id
                            ? "Execute läuft…"
                            : timelockReady
                            ? "Ausführen (Execute)"
                            : "Wartet auf Timelock"}
                        </Button>
                      )}
                      {live?.state === 5 && isNoop[p.proposal_id] && (
                        <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded p-2 w-full">
                          <span className="font-medium text-foreground">
                            Survey-Vorschlag — keine Ausführung möglich.
                          </span>{" "}
                          Dieser Vorschlag hat keine On-Chain-Aktion (calldata
                          ist leer). Das Ergebnis steht im Tally-Vertrag, der
                          Vorschlag bleibt dauerhaft im Zustand &bdquo;In Timelock&ldquo;.
                          OZ Governor lehnt Execute mit{" "}
                          <code className="font-mono">GovernorDisabledDeposit</code>{" "}
                          ab, weil es keinen Aufruf gibt, der durchgereicht
                          werden könnte.
                        </div>
                      )}
                      <Link href={`/app/proposals/${p.proposal_id}`}>
                        <Button variant="outline">Öffentliche Seite</Button>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
