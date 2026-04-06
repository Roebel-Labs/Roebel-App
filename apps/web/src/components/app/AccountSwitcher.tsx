"use client";

import { useAccount } from "@/lib/context/AccountContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { ACCOUNT_TYPE_LABELS } from "@/types/account";
import type { Account } from "@/types/account";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Check, PlusCircle } from "lucide-react";
import Link from "next/link";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

function AccountTypeBadge({ type }: { type: Account["account_type"] }) {
  if (type === "personal") return null;
  return (
    <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
      {ACCOUNT_TYPE_LABELS[type]}
    </span>
  );
}

/**
 * Account switcher — renders DropdownMenuItems for embedding
 * inside an existing DropdownMenu. Shows all owned accounts with
 * checkmark on active, and a "create org" option for citizens.
 */
export function AccountSwitcher() {
  const { activeAccount, ownedAccounts, switchAccount } = useAccount();
  const { user } = useUserProfile();

  const isCitizen = user?.tier === "citizen" || user?.is_verified_citizen;

  // Don't render if user has no accounts or only one personal account and can't create
  if (ownedAccounts.length <= 1 && !isCitizen) return null;

  return (
    <>
      <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
        Konto wechseln
      </p>
      {ownedAccounts.map((account) => {
        const isActive = activeAccount?.id === account.id;
        return (
          <DropdownMenuItem
            key={account.id}
            onClick={() => switchAccount(account.id)}
            className={`cursor-pointer gap-2 ${isActive ? "bg-accent" : ""}`}
          >
            <Avatar className="h-6 w-6 flex-shrink-0">
              {account.avatar_url && (
                <AvatarImage src={account.avatar_url} alt={account.name} />
              )}
              <AvatarFallback className="text-[10px] bg-muted-foreground/20">
                {getInitials(account.name)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm">{account.name}</span>
            <AccountTypeBadge type={account.account_type} />
            {isActive && (
              <Check className="h-3.5 w-3.5 text-primary flex-shrink-0 ml-auto" />
            )}
          </DropdownMenuItem>
        );
      })}

      {/* Create org — only for citizens */}
      {isCitizen && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href="/app/org/erstellen" className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              <span>Neue Organisation erstellen</span>
            </Link>
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
