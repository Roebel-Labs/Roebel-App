"use client";

import { ExternalLink } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  basescanAddress,
  MACI_INFRA,
  MACI_TREE_DEPTHS,
} from "@/lib/maci-config";
import { useMaciInfra } from "@/hooks/useMaciInfra";

function shortAddr(a: string): string {
  if (a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatDuration(seconds: number | bigint): string {
  const s = typeof seconds === "bigint" ? Number(seconds) : seconds;
  if (s <= 0) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatEth(wei: bigint | null | undefined): string {
  if (wei === null || wei === undefined) return "—";
  const ETH = 10n ** 18n;
  const whole = wei / ETH;
  const frac = wei % ETH;
  // 4 decimals
  const fracStr = (frac * 10000n / ETH).toString().padStart(4, "0");
  return `${whole}.${fracStr}`;
}

interface AddressRowProps {
  label: string;
  address: string;
  hint?: string;
  highlight?: boolean;
}

function AddressRow({ label, address, hint, highlight }: AddressRowProps) {
  return (
    <a
      href={basescanAddress(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-accent/40"
    >
      <div className="min-w-0">
        <p className={`text-sm ${highlight ? "font-medium" : "font-normal"}`}>
          {label}
        </p>
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <code className="font-mono text-xs text-muted-foreground">{shortAddr(address)}</code>
        <ExternalLink className="h-3 w-3 text-muted-foreground" />
      </div>
    </a>
  );
}

export function MaciInfraCard() {
  const { snapshot, isLoading, error } = useMaciInfra();

  const numSignUps = snapshot?.numSignUps ?? null;
  const params = snapshot?.governorParams ?? null;
  const balance = snapshot?.coordinatorBalanceWei ?? null;

  const lowBalance = balance !== null && balance < 10n ** 15n; // < 0.001 ETH

  return (
    <Card className="bg-card border border-border shadow-none">
      <CardHeader>
        <CardTitle>MACI-Infrastruktur</CardTitle>
        <CardDescription>
          Live von Base Mainnet. Deploy-Quelle:&nbsp;
          <code className="font-mono text-xs">contracts/governor-contract/deployments/base.json</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Live-Daten konnten nicht vollständig geladen werden: {error}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              MACI Sign-Ups
            </p>
            <p className="text-2xl font-medium">
              {isLoading && numSignUps === null
                ? "—"
                : numSignUps !== null
                ? numSignUps.toString()
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              Bürger:innen, die ihren Schlüssel registriert haben
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Quorum
            </p>
            <p className="text-2xl font-medium">
              {params ? params.quorum.toString() : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              Voice-Credits, mindestens {params?.quorumAbsolute?.toString() ?? "—"} (
              {params?.quorumPercentage?.toString() ?? "—"}% der Sign-Ups)
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Coordinator-Wallet
            </p>
            <p className={`text-2xl font-medium ${lowBalance ? "text-amber-600 dark:text-amber-400" : ""}`}>
              {balance !== null ? `${formatEth(balance)} ETH` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {lowBalance
                ? "⚠ niedriger Stand — bald nachfüllen"
                : "ausreichend für Tally-Veröffentlichung"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Aktive Verträge
            </p>
            <AddressRow
              label="MaciAttesterGovernor"
              address={MACI_INFRA.governor}
              hint="Vorschläge anlegen + state()/execute"
              highlight
            />
            <AddressRow
              label="TimelockController"
              address={MACI_INFRA.timelock}
              hint="Verzögerung vor execute"
            />
            <AddressRow
              label="MACI Core"
              address={MACI_INFRA.maci}
              hint="globale Sign-Up-Pool, Poll-Factory"
            />
            <AddressRow
              label="VkRegistry"
              address={MACI_INFRA.vkRegistry}
              hint="hält Process- & Tally-VKs"
            />
            <AddressRow
              label="Verifier"
              address={MACI_INFRA.verifier}
              hint="Groth16-Beweis-Verifizierung"
            />
            <AddressRow
              label="SignUpTokenGatekeeper"
              address={MACI_INFRA.gatekeeper}
              hint="bindet Sign-Up an CitizenNFT"
            />
            <AddressRow
              label="VoiceCreditProxy"
              address={MACI_INFRA.voiceCreditProxy}
              hint="1 Credit pro Sign-Up (non-QV)"
            />
            <AddressRow
              label="Coordinator EOA"
              address={MACI_INFRA.coordinator}
              hint="off-chain Schlüsselhalter (Fly.io)"
            />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Governance-Parameter
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Voting-Periode</p>
                <p className="font-medium">
                  {params ? formatDuration(params.votingPeriod) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Voting-Delay</p>
                <p className="font-medium">
                  {params ? formatDuration(params.votingDelay) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tally-Karenz</p>
                <p className="font-medium">
                  {params ? formatDuration(params.tallyGracePeriod) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Quorum (absolut)</p>
                <p className="font-medium">
                  {params ? params.quorumAbsolute.toString() : "—"}
                </p>
              </div>
            </div>

            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-2">
              Tree-Depths (Production zKey 14-9-2-3 / 14-5-3)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(MACI_TREE_DEPTHS).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs">
                  <span className="text-muted-foreground">{k}</span>
                  <Badge variant="outline" className="font-mono">
                    {v}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
