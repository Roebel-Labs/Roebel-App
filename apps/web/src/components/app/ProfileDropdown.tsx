"use client";

import { useActiveAccount, useActiveWallet, useDisconnect } from "thirdweb/react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { getUserDisplayName } from "@/lib/user-types";
import { useAccount } from "@/lib/context/AccountContext";
import { isOrgAccount, ACCOUNT_TYPE_LABELS } from "@/types/account";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { AccountSwitcher } from "@/components/app/AccountSwitcher";

function getInitial(name: string | null | undefined): string {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

export function ProfileDropdown() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  const { user } = useUserProfile();
  const { activeAccount: currentAccount } = useAccount();

  if (!account) return null;

  const displayName = user ? getUserDisplayName(user) : account.address.slice(0, 6) + "...";
  const initial = user?.username ? getInitial(user.username) : getInitial(displayName);

  // Mirror expo: when an org account is active, show the org's avatar/name instead
  // of the wallet owner's personal profile picture. Falls back to cover_url when
  // avatar_url is empty (matches apps/expo/app/profile.tsx).
  const isOrg = !!currentAccount && isOrgAccount(currentAccount);
  const headerAvatarUrl = isOrg
    ? currentAccount!.avatar_url ?? currentAccount!.cover_url ?? null
    : user?.profile_picture_url ?? null;
  const headerName = isOrg ? currentAccount!.name : displayName;
  const headerInitial = isOrg ? getInitial(currentAccount!.name) : initial;
  // Always land on the account-aware in-app profile — it renders the active
  // account (personal hub or org hero) so org owners no longer jump to /dashboard.
  const profileHref = "/app/profile";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative rounded-full hover:opacity-80 transition-opacity outline-none">
          <Avatar className="h-8 w-8">
            {headerAvatarUrl && (
              <AvatarImage src={headerAvatarUrl} alt={headerName} />
            )}
            <AvatarFallback className="bg-muted-foreground/20 text-foreground text-sm font-medium">
              {headerInitial}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center h-4 w-4 rounded-full bg-card border border-border shadow-sm">
            <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 p-0 overflow-hidden">
        {/* Profile header */}
        <div className="flex flex-col items-center gap-1 px-4 py-4">
          <Avatar className="h-14 w-14">
            {headerAvatarUrl && (
              <AvatarImage src={headerAvatarUrl} alt={headerName} />
            )}
            <AvatarFallback className="bg-muted-foreground/20 text-foreground text-xl font-medium">
              {headerInitial}
            </AvatarFallback>
          </Avatar>
          <div className="text-center mt-1">
            <p className="text-sm font-semibold">{headerName}</p>
            {!isOrg && user?.neighborhood && (
              <p className="text-xs text-muted-foreground">{user.neighborhood}</p>
            )}
          </div>
          <Link
            href={profileHref}
            className="mt-2 px-4 py-1.5 text-xs font-medium rounded-full border border-border hover:bg-accent transition-colors"
          >
            Profil ansehen
          </Link>
        </div>

        <DropdownMenuSeparator className="my-0" />

        {/* Active account indicator + Account switcher */}
        {currentAccount && isOrgAccount(currentAccount) && (
          <div className="px-4 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Aktives Konto</p>
            <p className="text-sm font-medium text-foreground truncate">{currentAccount.name}</p>
            <span className="text-[10px] text-muted-foreground">
              {ACCOUNT_TYPE_LABELS[currentAccount.account_type]}
            </span>
          </div>
        )}

        <div className="p-1">
          <AccountSwitcher />
        </div>

        <DropdownMenuSeparator className="my-0" />

        {/* Logout */}
        <div className="p-1">
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => {
              if (wallet) disconnect(wallet);
            }}
          >
            <LogOut className="h-4 w-4" />
            <span>Abmelden</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
