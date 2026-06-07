"use client";

import { useState } from "react";
import { Check, Copy, Crown, RefreshCw, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSocialGraph } from "@/hooks/useSocialGraph";
import { formatWalletAddress } from "@/lib/user-types";
import { SUB_TYPE_EMOJI, SUB_TYPE_LABELS } from "@/types/account";
import {
  resolveEntry,
  type Directory,
  type MembershipByWallet,
} from "../_lib/directory";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-muted-foreground transition-colors hover:text-foreground"
      title="Wallet kopieren"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/**
 * Roster of the real active attesters (Bescheiniger) read live on-chain via the
 * social graph, joined to Supabase names + the org accounts they belong to.
 */
export function AttestersPanel({
  directory,
  membershipByWallet,
}: {
  directory: Directory;
  membershipByWallet: MembershipByWallet;
}) {
  const { nodes, edges, isLoading, error } = useSocialGraph();

  if (isLoading && nodes.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (error && nodes.length === 0) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4" /> On-Chain nicht erreichbar — {error}
      </div>
    );
  }

  const attesters = nodes
    .filter((n) => n.type === "attester" && n.status === "active")
    .sort((a, b) => Number(b.isFounder) - Number(a.isFounder));

  if (attesters.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Noch keine Bescheiniger.
      </p>
    );
  }

  // Distinct citizens verified per attester (edges: source = approver/attester).
  const verifiedCount = (address: string): number => {
    const a = address.toLowerCase();
    return edges.filter(
      (e) => e.source.toLowerCase() === a && e.type === "citizen_approved"
    ).length;
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {attesters.length} aktive{attesters.length === 1 ? "r" : ""}{" "}
        Bescheiniger.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {attesters.map((node) => {
          const entry = resolveEntry(directory, node.address);
          const name = entry?.name ?? formatWalletAddress(node.address);
          const orgs = membershipByWallet[node.address.toLowerCase()] ?? [];
          const verified = verifiedCount(node.address);

          return (
            <li
              key={node.address}
              className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  {entry?.avatar && (
                    <AvatarImage src={entry.avatar} alt={name} />
                  )}
                  <AvatarFallback className="text-xs">
                    {(entry?.username ?? node.address)
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="truncate max-w-[200px]">{name}</span>
                    {node.isFounder && (
                      <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    {!entry && (
                      <span className="text-xs italic text-muted-foreground/70">
                        (kein Profil)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    {formatWalletAddress(node.address)}
                    <CopyButton value={node.address} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                <Badge variant="success" className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {verified} verifiziert
                </Badge>
                {orgs.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Keine Organisation
                  </span>
                ) : (
                  orgs.map((org) => (
                    <Badge key={org.id} variant="outline" className="gap-1">
                      {org.subType ? SUB_TYPE_EMOJI[org.subType] : "🏢"}{" "}
                      {org.name}
                      <span className="text-muted-foreground">
                        ·{" "}
                        {org.subType ? SUB_TYPE_LABELS[org.subType] : "Org"}
                      </span>
                    </Badge>
                  ))
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
