import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Props {
  walletAddress: string;
  username: string | null;
  avatarUrl: string | null;
}

// Renders a compact buyer identity: avatar + username (primary line) +
// truncated wallet (secondary). Falls back to wallet-only when no
// `users` row exists for the wallet. Used by both the overview and
// the purchases list so the look stays consistent.
export function BuyerCell({ walletAddress, username, avatarUrl }: Props) {
  const displayName = username?.trim() || null;
  const initials = getInitials(displayName, walletAddress);
  const truncated = truncateWallet(walletAddress);

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar className="h-8 w-8 flex-shrink-0">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName ?? truncated} /> : null}
        <AvatarFallback className="text-xs font-medium">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        {displayName ? (
          <>
            <div className="truncate text-sm font-medium text-foreground">
              {displayName}
            </div>
            <div className="truncate text-[11px] text-muted-foreground font-mono">
              {truncated}
            </div>
          </>
        ) : (
          <div className="truncate text-xs font-mono text-foreground">
            {truncated}
          </div>
        )}
      </div>
    </div>
  );
}

function getInitials(
  displayName: string | null,
  walletAddress: string,
): string {
  if (displayName) {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  }
  // Use the first two hex chars after the "0x" prefix as a stable fallback.
  return walletAddress.slice(2, 4).toUpperCase();
}

function truncateWallet(wallet: string): string {
  if (wallet.length <= 14) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}
