"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronDown, LogOut, Settings, User as UserIcon } from "lucide-react";
import {
  useActiveAccount,
  useActiveWallet,
  useDisconnect,
} from "thirdweb/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAccount } from "@/lib/context/AccountContext";
import { SUB_TYPE_LABELS } from "@/types/account";
import {
  formatWalletAddress,
  getUserDisplayName,
} from "@/lib/user-types";
import type { Account } from "@/types/account";

function initials(name: string | null | undefined, fallback: string): string {
  const source = name?.trim() || fallback;
  return source
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function accountLabel(account: Account | null): string {
  if (!account) return "";
  if (account.account_type === "personal") return account.name || "Persönlich";
  return account.name;
}

function accountSubLabel(account: Account | null): string | null {
  if (!account) return null;
  if (account.account_type === "personal") return "Persönliches Konto";
  if (account.sub_type) return SUB_TYPE_LABELS[account.sub_type];
  return "Organisation";
}

export function ProfilePill() {
  const router = useRouter();
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  const { user } = useUserProfile();
  const {
    activeAccount,
    ownedAccounts,
    switchAccount,
    isLoading: isAccountLoading,
  } = useAccount();

  const [switchingId, setSwitchingId] = useState<string | null>(null);

  if (!account) return null;

  const walletAddress = account.address;
  const fallbackName = formatWalletAddress(walletAddress);
  const displayName =
    activeAccount && activeAccount.account_type !== "personal"
      ? activeAccount.name
      : user
        ? getUserDisplayName(user)
        : fallbackName;
  const avatarUrl =
    activeAccount && activeAccount.account_type !== "personal"
      ? activeAccount.avatar_url
      : user?.profile_picture_url || null;

  const handleSwitch = async (accountId: string) => {
    if (switchingId || accountId === activeAccount?.id) return;
    setSwitchingId(accountId);
    try {
      await switchAccount(accountId);
      router.refresh();
    } catch (err) {
      console.error("Failed to switch account", err);
    } finally {
      setSwitchingId(null);
    }
  };

  const handleDisconnect = async () => {
    if (!wallet) return;
    try {
      await disconnect(wallet);
      router.refresh();
    } catch (err) {
      console.error("Failed to disconnect", err);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Profil-Menü öffnen"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 py-1 text-sm text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Avatar className="h-7 w-7">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
            <AvatarFallback className="text-xs font-medium">
              {initials(displayName, fallbackName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[140px] truncate sm:inline">
            {displayName}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2">
          <Avatar className="h-10 w-10">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
            <AvatarFallback className="text-sm font-medium">
              {initials(displayName, fallbackName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {fallbackName}
            </div>
          </div>
        </DropdownMenuLabel>

        {ownedAccounts.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Konten
            </DropdownMenuLabel>
            {ownedAccounts.map((acc) => {
              const isActive = acc.id === activeAccount?.id;
              const isSwitching = switchingId === acc.id;
              const label = accountLabel(acc);
              const subLabel = accountSubLabel(acc);
              const accAvatar = acc.avatar_url;
              return (
                <DropdownMenuItem
                  key={acc.id}
                  onSelect={(event) => {
                    event.preventDefault();
                    void handleSwitch(acc.id);
                  }}
                  disabled={isActive || isSwitching}
                  className="flex items-center gap-3 py-2"
                >
                  <Avatar className="h-8 w-8">
                    {accAvatar ? <AvatarImage src={accAvatar} alt={label} /> : null}
                    <AvatarFallback className="text-xs font-medium">
                      {initials(label, "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {label}
                    </div>
                    {subLabel ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {subLabel}
                      </div>
                    ) : null}
                  </div>
                  {isActive ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </>
        ) : isAccountLoading ? (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            Konten werden geladen…
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center gap-2">
            <UserIcon className="h-4 w-4" />
            <span>Profil</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/app/einstellungen" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>Einstellungen</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleDisconnect();
          }}
          className="flex items-center gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          <span>Abmelden</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
