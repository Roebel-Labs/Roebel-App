"use client";

import Link from "next/link";
import {
  getMembershipBadge,
  getMembershipBadgeText,
  getMembershipBadgeColors,
  formatWalletAddress,
} from "@/lib/user-types";
import type { User } from "@/lib/user-types";

interface NFTStatusCardProps {
  user: User;
  isLoading?: boolean;
}

export function NFTStatusCard({ user, isLoading }: NFTStatusCardProps) {
  const nftBalance = Number(user.nft_balance);
  const hasCitizenNFT = nftBalance > 0;
  const badge = getMembershipBadge(nftBalance);
  const badgeText = getMembershipBadgeText(badge);
  const badgeColors = getMembershipBadgeColors(badge);

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-1/2 mb-4" />
          <div className="h-4 bg-muted rounded w-full mb-2" />
          <div className="h-4 bg-muted rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-6">
      <h3 className="text-xl font-medium text-foreground mb-4">
        Citizen Membership Status
      </h3>

      {/* Membership Badge */}
      <div className="mb-6">
        <div
          className={`${badgeColors.bg} ${badgeColors.text} border ${badgeColors.border} rounded-lg p-4 text-center`}
        >
          <div className="text-3xl mb-2">{hasCitizenNFT ? "✅" : "❌"}</div>
          <div className="font-medium text-lg">{badgeText}</div>
        </div>
      </div>

      {/* NFT Details */}
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">NFT Balance:</span>
          <span className="text-foreground font-medium">{nftBalance}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">Delegated:</span>
          <span className="text-foreground font-medium">
            {user.has_delegated ? "✅ Yes" : "❌ No"}
          </span>
        </div>

        {user.has_delegated && user.delegate_address && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Delegate:</span>
            <span className="text-foreground font-mono text-xs">
              {formatWalletAddress(user.delegate_address)}
            </span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-6 space-y-3">
        {!hasCitizenNFT ? (
          <Link
            href="/mint"
            className="block w-full bg-black hover:bg-foreground/90 text-white text-center px-4 py-3 rounded-lg font-medium transition-colors"
          >
            Mint Citizen NFT
          </Link>
        ) : (
          <>
            {!user.has_delegated && (
              <Link
                href="/delegate"
                className="block w-full bg-black hover:bg-foreground/90 text-white text-center px-4 py-3 rounded-lg font-medium transition-colors"
              >
                Delegate Voting Power
              </Link>
            )}

            <Link
              href="/proposals"
              className="block w-full bg-muted hover:bg-muted text-foreground text-center px-4 py-3 rounded-lg font-medium transition-colors"
            >
              View Proposals
            </Link>
          </>
        )}
      </div>

      {/* Info Text */}
      <div className="mt-4 p-3 bg-muted border border-border rounded-lg">
        <p className="text-xs text-muted-foreground">
          {hasCitizenNFT ? (
            <>
              You&apos;re a Citizen Member!
              {user.has_delegated
                ? " You can now vote on proposals."
                : " Delegate your voting power to participate in governance."}
            </>
          ) : (
            "Mint a Citizen Membership NFT to participate in DAO governance and vote on proposals."
          )}
        </p>
      </div>
    </div>
  );
}
