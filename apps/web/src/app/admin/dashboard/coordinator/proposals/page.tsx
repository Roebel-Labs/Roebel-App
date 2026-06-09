"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  useActiveAccount,
  useSendTransaction,
} from "thirdweb/react";
import { prepareContractCall, readContract } from "thirdweb";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { maciGovernorContract, basescanTx } from "@/lib/maci-config";

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
};

type ProposalActionData = {
  targets: string[];
  values: string[];
  calldatas: string[];
  description: string;
  descriptionHash: string;
};

const STATE_LABELS: Record<number, { label: string; tone: "neutral" | "amber" | "red" | "green" | "blue" }> = {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tallying, setTallying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const { mutate: sendTransaction } = useSendTransaction();

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

  // For each proposal, fetch live state + votes from the Governor.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, LiveState> = {};
      for (const p of proposals) {
        try {
          const id = BigInt(p.blockchain_proposal_id);
          const [state, votes, snapshot, deadline, eta] = await Promise.all([
            readContract({
              contract: maciGovernorContract,
              method: "function state(uint256) view returns (uint8)",
              params: [id],
            }) as Promise<number>,
            readContract({
              contract: maciGovernorContract,
              method:
                "function proposalVotes(uint256) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
              params: [id],
            }) as Promise<readonly [bigint, bigint, bigint]>,
            readContract({
              contract: maciGovernorContract,
              method: "function proposalSnapshot(uint256) view returns (uint256)",
              params: [id],
            }).catch(() => null) as Promise<bigint | null>,
            readContract({
              contract: maciGovernorContract,
              method: "function proposalDeadline(uint256) view returns (uint256)",
              params: [id],
            }).catch(() => null) as Promise<bigint | null>,
            readContract({
              contract: maciGovernorContract,
              method: "function proposalEta(uint256) view returns (uint256)",
              params: [id],
            }).catch(() => null) as Promise<bigint | null>,
          ]);
          next[p.proposal_id] = {
            state: Number(state),
            againstVotes: votes[0].toString(),
            forVotes: votes[1].toString(),
            abstainVotes: votes[2].toString(),
            voteStartTs: snapshot ? Number(snapshot) : null,
            voteEndTs: deadline ? Number(deadline) : null,
            eta: eta ? Number(eta) : null,
          };
        } catch (err) {
          console.warn("[admin/proposals] state read failed for", p.proposal_id, err);
        }
        if (cancelled) return;
        setLiveState({ ...next });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposals]);

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

  const handleTriggerTally = useCallback(async () => {
    if (!account || !isFounder) return;
    setError(null);
    setFeedback(null);
    setTallying(true);
    try {
      const message = `Roebel DAO finalize-pending v1\nts=${Date.now()}`;
      const signature = await account.signMessage({ message });
      const res = await fetch("/api/coordinator/finalize-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          founderWallet: account.address,
          signature,
          message,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setFeedback(
        "Tally-Scan auf Fly gestartet. Status: /admin/dashboard/coordinator → Fly /status. Erstes Resultat üblicherweise in ~15 min (Proof-Gen + Submit)."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTallying(false);
    }
  }, [account, isFounder]);

  const handleQueue = useCallback(
    async (p: ProposalRow) => {
      if (!account) return;
      setError(null);
      setFeedback(null);
      setBusyId(p.proposal_id);
      try {
        const data = await getActionData(p.transaction_hash);
        const tx = prepareContractCall({
          contract: maciGovernorContract,
          method:
            "function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)",
          params: [
            data.targets,
            data.values.map((v) => BigInt(v)),
            data.calldatas as `0x${string}`[],
            data.descriptionHash as `0x${string}`,
          ],
        });
        sendTransaction(tx, {
          onSuccess: (result) => {
            setFeedback(
              `Queue-Tx eingereicht: ${result.transactionHash} — nach Timelock-Delay erscheint der Execute-Button.`
            );
            setBusyId(null);
          },
          onError: (err) => {
            setError(err.message);
            setBusyId(null);
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusyId(null);
      }
    },
    [account, getActionData, sendTransaction]
  );

  const handleExecute = useCallback(
    async (p: ProposalRow) => {
      if (!account) return;
      setError(null);
      setFeedback(null);
      setBusyId(p.proposal_id);
      try {
        const data = await getActionData(p.transaction_hash);
        const tx = prepareContractCall({
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
        sendTransaction(tx, {
          onSuccess: (result) => {
            setFeedback(
              `Execute-Tx eingereicht: ${result.transactionHash} — chain-listener flippt activated_at innerhalb 5 min.`
            );
            setBusyId(null);
          },
          onError: (err) => {
            setError(err.message);
            setBusyId(null);
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusyId(null);
      }
    },
    [account, getActionData, sendTransaction]
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
          <CardTitle>Pending Tallies</CardTitle>
          <CardDescription>
            Sammelt alle Vorschläge, deren Abstimmungs-Frist abgelaufen ist,
            deren MACI-Poll aber noch nicht getallyt wurde. Der Coordinator
            verarbeitet sie sequentiell (jeweils ~15 min für Proof-Gen + Submit).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleTriggerTally} disabled={tallying} className="w-full sm:w-auto">
            {tallying ? "Sende…" : "Tally-Scan auf Fly starten"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Verwendet den Legacy-Pfad (COORDINATOR_PRIV auf Fly). Sobald nach
            der nächsten Rotation der erste Shamir-Tally durchläuft, wird
            COORDINATOR_PRIV entfernt — danach ersetzt die Shamir-Session diese
            Schaltfläche.
          </p>
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
                      {live?.state === 5 && (
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
