"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COORDINATOR_BASE_URL, basescanAddress } from "@/lib/maci-config";
import { useCoordinatorHealth } from "@/hooks/useCoordinatorHealth";

function formatRelative(iso: string | undefined | null): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "in der Zukunft";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `vor ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `vor ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `vor ${hr}h`;
  const d = Math.floor(hr / 24);
  return `vor ${d}d`;
}

function ScanStatusBadge({ status }: { status: string | undefined }) {
  if (!status) return <Badge variant="outline">—</Badge>;
  const map: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
    succeeded: {
      label: "Erfolgreich",
      icon: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
      className: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    },
    partial: {
      label: "Teilweise",
      icon: <AlertTriangle className="h-3 w-3 text-amber-500" />,
      className: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    },
    noop: {
      label: "Nichts ausstehend",
      icon: <CheckCircle2 className="h-3 w-3 text-muted-foreground" />,
      className: "",
    },
    "scan-failed": {
      label: "Fehler",
      icon: <XCircle className="h-3 w-3 text-red-500" />,
      className: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    },
  };
  const v = map[status] ?? { label: status, icon: null, className: "" };
  return (
    <Badge variant="outline" className={`gap-1 ${v.className}`}>
      {v.icon}
      {v.label}
    </Badge>
  );
}

function RunStatusBadge({ status }: { status: string | undefined }) {
  if (!status) return <Badge variant="outline">—</Badge>;
  if (status === "succeeded") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        Erfolgreich
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <XCircle className="h-3 w-3 text-red-500" />
        Fehlgeschlagen
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
}

export function CoordinatorHealthCard() {
  const { status, isLoading, error, refresh, lastFetched } = useCoordinatorHealth();

  const lastScanAge = useMemo(() => {
    if (!status?.lastScan?.finishedAt) return null;
    const ts = Date.parse(status.lastScan.finishedAt);
    if (Number.isNaN(ts)) return null;
    return Date.now() - ts;
  }, [status]);

  const scanStale = lastScanAge !== null && lastScanAge > 4 * 60 * 60 * 1000; // 4h

  return (
    <Card className="bg-card border border-border shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Coordinator-Service</CardTitle>
            <CardDescription>
              Off-chain Tally-Pipeline auf Fly.io. GitHub Actions cron triggert{" "}
              <code className="font-mono text-xs">/finalize-pending</code> alle 15 Minuten.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Aktualisieren
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Konnte <code className="font-mono text-xs">{COORDINATOR_BASE_URL}/status</code> nicht erreichen:&nbsp;
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Aktiv</p>
            <p className="text-2xl font-medium">
              {status?.scanInFlight ? (
                <span className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Loader2 className="h-5 w-5 animate-spin" /> läuft
                </span>
              ) : status?.ready ? (
                <span className="text-emerald-600 dark:text-emerald-400">bereit</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {lastFetched ? `Stand: ${lastFetched.toLocaleTimeString("de-DE")}` : "—"}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Letzter Scan</p>
            <div className="mt-1 flex items-center gap-2">
              <ScanStatusBadge status={status?.lastScan?.status} />
              {scanStale ? (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  &gt; 4 Std
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatRelative(status?.lastScan?.finishedAt)}
              {status?.lastScan?.pendingCount !== undefined &&
              status?.lastScan?.pendingCount > 0 ? (
                <>
                  {" · "}
                  {status.lastScan.finalizedCount ?? 0}/
                  {status.lastScan.pendingCount} finalisiert
                </>
              ) : null}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Letzte Finalisierung
            </p>
            <div className="mt-1 flex items-center gap-2">
              <RunStatusBadge status={status?.lastRun?.status} />
              {status?.lastRun?.pollId ? (
                <Badge variant="outline" className="font-mono text-xs">
                  Poll {status.lastRun.pollId}
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatRelative(status?.lastRun?.finishedAt)}
            </p>
          </div>
        </div>

        {status?.lastScan?.failed && status.lastScan.failed.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Fehlgeschlagene Polls im letzten Scan
            </p>
            <ul className="mt-1 space-y-1 text-xs text-amber-800 dark:text-amber-300">
              {status.lastScan.failed.map((p) => (
                <li key={p.pollId} className="flex items-center justify-between gap-2">
                  <span>Poll {p.pollId}</span>
                  <a
                    href={basescanAddress(p.tally)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono"
                  >
                    {p.tally.slice(0, 8)}…<ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {status?.lastRun?.error ? (
          <details className="rounded-md border border-border bg-muted/40 p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              Letzter Fehler-Stack
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[10px] leading-tight text-muted-foreground">
              {status.lastRun.error}
            </pre>
          </details>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
          <a
            href={`${COORDINATOR_BASE_URL}/status`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            JSON-Status öffnen <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://fly.io/apps/roebel-maci-coordinator/monitoring"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            Fly Logs <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href="https://github.com/Roebel-Labs/Roebel-App/actions/workflows/coordinator-cron.yml"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            GH Actions Cron <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
