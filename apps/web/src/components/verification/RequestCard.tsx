"use client";

import { StatusBadge } from "./StatusBadge";
import { de } from "@/lib/translations/de";
import Link from "next/link";
import { getBlockscoutContractEventsUrl } from "@/lib/blockscout";
import { VERIFICATION_CONTRACTS } from "@/lib/verification-contracts";

interface RequestCardProps {
  requestId: number;
  target: string;
  type: "Attestation" | "Revocation";
  status: "Pending" | "Approved" | "Rejected" | "Executed";
  contractType: "attester" | "citizen";
}

export function RequestCard({
  requestId,
  target,
  type,
  status,
  contractType,
}: RequestCardProps) {
  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <Link href={`/verifizierung/nachweis/${requestId}?contract=${contractType}`}>
      <div className="bg-card border border-border rounded-lg p-4 sm:p-6 hover:border-gray-400 transition-colors cursor-pointer">
        {/* Header with badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground font-mono text-sm">#{requestId}</span>
            <StatusBadge status={status} />
          </div>
          <div className="text-xs text-muted-foreground">
            {type === "Attestation" ? de.verification.attestationRequest : de.verification.revocationRequest}
          </div>
        </div>

        {/* Target address */}
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-1">Ziel-Adresse</div>
          <div className="font-mono text-sm text-foreground font-medium">
            {truncateAddress(target)}
          </div>
        </div>

        {/* View details link */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-foreground hover:text-foreground flex items-center gap-1 font-medium">
            <span>Details ansehen</span>
            <span>→</span>
          </div>
          {status === "Pending" && (
            <div className="text-xs text-muted-foreground">
              Wartet auf Unterschriften
            </div>
          )}
        </div>

        {/* Blockscout link */}
        <div className="mt-4 pt-4 border-t border-border">
          <a
            href={getBlockscoutContractEventsUrl(
              contractType === "attester"
                ? VERIFICATION_CONTRACTS.attesterNFT
                : VERIFICATION_CONTRACTS.citizenNFT
            )}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()} // Prevent navigation to detail page
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            View Contract Events
          </a>
        </div>
      </div>
    </Link>
  );
}
