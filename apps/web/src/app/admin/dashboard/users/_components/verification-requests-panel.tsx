"use client";

import { FileText, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useOpenVerifications,
  type VerificationRequest,
} from "@/hooks/useOpenVerifications";
import { formatWalletAddress } from "@/lib/user-types";
import { resolveEntry, type Directory } from "../_lib/directory";

function relativeTime(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  const diffMs = Date.now() - unixSeconds * 1000;
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return "heute";
  if (days === 1) return "vor 1 Tag";
  if (days < 30) return `vor ${days} Tagen`;
  const months = Math.floor(days / 30);
  return months === 1 ? "vor 1 Monat" : `vor ${months} Monaten`;
}

function NameCell({
  directory,
  address,
}: {
  directory: Directory;
  address: string;
}) {
  const entry = resolveEntry(directory, address);
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">
        {entry?.name ?? formatWalletAddress(address)}
      </div>
      <div className="font-mono text-xs text-muted-foreground">
        {formatWalletAddress(address)}
        {!entry && (
          <span className="ml-1 italic text-muted-foreground/70">
            (kein Profil)
          </span>
        )}
      </div>
    </div>
  );
}

function RequestRow({
  req,
  directory,
}: {
  req: VerificationRequest;
  directory: Directory;
}) {
  const isRevocation = req.requestType === 1;
  const sigText =
    req.contract === "citizen"
      ? `${req.attesterSignatures ?? 0} Attester · ${
          req.citizenSignatures ?? 0
        } Bürger`
      : `${req.signatureCount ?? 0} Signaturen`;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2.5">
        <NameCell directory={directory} address={req.target} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={req.contract === "attester" ? "info" : "success"}>
            {req.contract === "attester" ? "Bescheiniger" : "Bürger"}
          </Badge>
          <Badge variant={isRevocation ? "error" : "pending"}>
            {isRevocation ? "Widerruf" : "Aufnahme"}
          </Badge>
        </div>
      </td>
      <td className="px-3 py-2.5 text-muted-foreground">{sigText}</td>
      <td className="hidden px-3 py-2.5 sm:table-cell">
        <NameCell directory={directory} address={req.requester} />
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
        <div>{relativeTime(req.createdAt)}</div>
        {req.evidenceURI && (
          <a
            href={req.evidenceURI}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-[#194383] hover:underline"
          >
            <FileText className="h-3 w-3" /> Nachweis
          </a>
        )}
      </td>
    </tr>
  );
}

/**
 * Lists the real open (pending) on-chain verification requests — the entities
 * behind the "Offene Verifizierungen" KPI. Wallets are resolved to names via the
 * directory built server-side from the user rows.
 */
export function VerificationRequestsPanel({
  directory,
}: {
  directory: Directory;
}) {
  const { requests, isLoading, error } = useOpenVerifications();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4" /> On-Chain nicht erreichbar — {error}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Keine offenen Verifizierungsanträge.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">Antragsteller (Ziel)</th>
            <th className="px-3 py-2.5 font-medium">Art</th>
            <th className="px-3 py-2.5 font-medium">Signaturen</th>
            <th className="hidden px-3 py-2.5 font-medium sm:table-cell">
              Eingereicht von
            </th>
            <th className="px-3 py-2.5 text-right font-medium">Erstellt</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => (
            <RequestRow
              key={`${req.contract}-${req.requestId}`}
              req={req}
              directory={directory}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
