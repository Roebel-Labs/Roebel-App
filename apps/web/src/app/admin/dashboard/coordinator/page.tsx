"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useReadContract } from "thirdweb/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MACI_INFRA, maciGovernorContract } from "@/lib/maci-config";

const TOTAL_SHARES = 5;
const THRESHOLD = 3;

type Registration = {
  walletAddress: string;
  registeredAt: string;
};

type ActiveGeneration = {
  id: string;
  governor_address: string;
  pubkey_x: string;
  pubkey_y: string;
  threshold: number;
  total_shares: number;
  created_by_wallet: string;
  created_at: string;
  proposal_id: string | null;
  set_pubkey_tx_hash: string | null;
  activated_at: string | null;
  superseded_at: string | null;
} | null;

type GenerationSummary = {
  id: string;
  pubkey_x: string;
  pubkey_y: string;
  threshold: number;
  total_shares: number;
  created_at: string;
  proposal_id: string | null;
  set_pubkey_tx_hash: string | null;
  activated_at: string | null;
  superseded_at: string | null;
};

type AuditRow = {
  id: string;
  event_type: string;
  actor_wallet: string | null;
  target_id: string | null;
  tx_hash: string | null;
  created_at: string;
};

type CoordinatorState = {
  registrations: Registration[];
  activeGeneration: ActiveGeneration;
  latestGenerations: GenerationSummary[];
  recentAuditLog: AuditRow[];
};

export default function CoordinatorStatusPage() {
  const [state, setState] = useState<CoordinatorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: onChainCoordinator } = useReadContract({
    contract: maciGovernorContract,
    method: "function coordinator() view returns (address)",
    params: [],
  });

  const { data: onChainPubKey } = useReadContract({
    contract: maciGovernorContract,
    method:
      "function coordinatorPubKey() view returns (uint256 x, uint256 y)",
    params: [],
  });

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/coordinator/state", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setState(json as CoordinatorState);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const allRegistered =
    state !== null && state.registrations.length >= TOTAL_SHARES;

  // Compare on-chain pubkey to the latest activated generation's pubkey
  const onChainX = onChainPubKey
    ? (onChainPubKey as unknown as [bigint, bigint])[0]?.toString()
    : null;
  const onChainY = onChainPubKey
    ? (onChainPubKey as unknown as [bigint, bigint])[1]?.toString()
    : null;
  const activePub = state?.activeGeneration;
  const supabaseMatchesChain =
    onChainX && onChainY && activePub
      ? activePub.pubkey_x === onChainX && activePub.pubkey_y === onChainY
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-foreground">
            MACI Coordinator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Status, Registrierungen und Rotations-Historie für den Shamir-3-von-5
            Coordinator-Key.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchState} disabled={loading}>
            ↻ Aktualisieren
          </Button>
          <Link href="/admin/dashboard/coordinator/register-share-key">
            <Button variant="outline">Share-Key registrieren</Button>
          </Link>
          <Link href="/admin/dashboard/coordinator/generate-key">
            <Button>Rotation starten</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>On-Chain Zustand</CardTitle>
          <CardDescription>
            Aktueller Coordinator + Pubkey beim MACI Governor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Coordinator: </span>
            <span className="font-mono break-all">
              {onChainCoordinator
                ? (onChainCoordinator as string)
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">PubKey X: </span>
            <span className="font-mono break-all">{onChainX ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">PubKey Y: </span>
            <span className="font-mono break-all">{onChainY ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Governor: </span>
            <a
              href={`https://basescan.org/address/${MACI_INFRA.governor}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono underline"
            >
              {MACI_INFRA.governor}
            </a>
          </div>
          {supabaseMatchesChain === false && (
            <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2 mt-3">
              ⚠️ On-Chain Pubkey weicht von der zuletzt aktivierten Generation
              in Supabase ab. Entweder läuft gerade eine Rotation oder die
              Audit-Daten sind nicht synchron.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Bescheiniger-Registrierungen</CardTitle>
              <CardDescription>
                Wer einen Curve25519-Pubkey für Share-Verschlüsselung
                hinterlegt hat. Erforderlich: {TOTAL_SHARES}/{TOTAL_SHARES}.
              </CardDescription>
            </div>
            {allRegistered ? (
              <Badge className="bg-green-600 text-white hover:bg-green-700">
                ✓ {state?.registrations.length ?? 0}/{TOTAL_SHARES}
              </Badge>
            ) : (
              <Badge variant="outline">
                {state?.registrations.length ?? 0}/{TOTAL_SHARES}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {state && state.registrations.length > 0 ? (
            <ul className="space-y-1 text-xs font-mono">
              {state.registrations.map((r) => (
                <li
                  key={r.walletAddress}
                  className="flex justify-between text-muted-foreground"
                >
                  <span>✓ {r.walletAddress}</span>
                  <span>
                    {new Date(r.registeredAt).toLocaleDateString("de-DE")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">
              Noch keine Registrierungen.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Letzte Generationen</CardTitle>
          <CardDescription>
            Schlüssel-Ceremonien (max. 10 zuletzt). Threshold {THRESHOLD}-von-
            {TOTAL_SHARES} ist Standard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state && state.latestGenerations.length > 0 ? (
            <ul className="space-y-3">
              {state.latestGenerations.map((g) => (
                <li
                  key={g.id}
                  className="border border-border rounded p-3 text-xs space-y-1"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-muted-foreground">
                      gen={g.id.slice(0, 8)}…
                    </span>
                    <div className="flex gap-2">
                      {g.activated_at ? (
                        <Badge className="bg-green-600 text-white hover:bg-green-700">
                          Aktiv
                        </Badge>
                      ) : g.proposal_id ? (
                        <Badge variant="outline">Proposal eingereicht</Badge>
                      ) : (
                        <Badge variant="outline">Wartet auf Proposal</Badge>
                      )}
                      {g.superseded_at && (
                        <Badge variant="outline">Abgelöst</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Threshold:{" "}
                    </span>
                    {g.threshold}-of-{g.total_shares}
                  </div>
                  <div className="font-mono break-all">
                    pubX: {g.pubkey_x.slice(0, 24)}…
                  </div>
                  {g.proposal_id && (
                    <div>
                      <Link
                        href={`/app/proposals/${g.proposal_id}`}
                        className="underline text-blue-700"
                      >
                        → Proposal {g.proposal_id.slice(0, 10)}…
                      </Link>
                    </div>
                  )}
                  {g.set_pubkey_tx_hash && (
                    <div>
                      <a
                        href={`https://basescan.org/tx/${g.set_pubkey_tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-blue-700"
                      >
                        Tx ansehen
                      </a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">
              Noch keine Generationen.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit-Log (zuletzt 20)</CardTitle>
        </CardHeader>
        <CardContent>
          {state && state.recentAuditLog.length > 0 ? (
            <ul className="space-y-1 text-xs">
              {state.recentAuditLog.map((row) => (
                <li
                  key={row.id}
                  className="flex justify-between text-muted-foreground"
                >
                  <span className="font-mono">
                    {row.event_type}{" "}
                    {row.actor_wallet ? `· ${row.actor_wallet.slice(0, 10)}…` : ""}
                  </span>
                  <span>
                    {new Date(row.created_at).toLocaleString("de-DE")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">
              Keine Einträge.
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 text-sm text-red-800">
            {error}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
