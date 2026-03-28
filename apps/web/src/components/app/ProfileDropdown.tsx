"use client";

import { useState, useEffect } from "react";
import { useActiveAccount, useActiveWallet, useDisconnect } from "thirdweb/react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { getUserDisplayName } from "@/lib/user-types";
import { getBusinessesByOwner } from "@/app/actions/businesses";
import type { Business } from "@/types/business";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Building2, LogOut, PlusCircle, Store } from "lucide-react";
import Link from "next/link";

function getInitial(name: string | null | undefined): string {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

export function ProfileDropdown() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  const { user } = useUserProfile();
  const [business, setBusiness] = useState<Business | null>(null);

  // Fetch user's business from DB
  useEffect(() => {
    async function fetchBusiness() {
      if (!account?.address) {
        setBusiness(null);
        return;
      }
      const result = await getBusinessesByOwner(account.address);
      if (result.success && result.data && result.data.length > 0) {
        setBusiness(result.data[0]);
      } else {
        setBusiness(null);
      }
    }
    fetchBusiness();
  }, [account?.address]);

  if (!account) return null;

  const displayName = user ? getUserDisplayName(user) : account.address.slice(0, 6) + "...";
  const initial = user?.username ? getInitial(user.username) : getInitial(displayName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative rounded-full hover:opacity-80 transition-opacity outline-none">
          <Avatar className="h-8 w-8">
            {user?.profile_picture_url && (
              <AvatarImage src={user.profile_picture_url} alt={displayName} />
            )}
            <AvatarFallback className="bg-muted-foreground/20 text-foreground text-sm font-medium">
              {initial}
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
            {user?.profile_picture_url && (
              <AvatarImage src={user.profile_picture_url} alt={displayName} />
            )}
            <AvatarFallback className="bg-muted-foreground/20 text-foreground text-xl font-medium">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="text-center mt-1">
            <p className="text-sm font-semibold">{displayName}</p>
            {user?.neighborhood && (
              <p className="text-xs text-muted-foreground">{user.neighborhood}</p>
            )}
          </div>
          <Link
            href={`/app/profile/${account.address}`}
            className="mt-2 px-4 py-1.5 text-xs font-medium rounded-full border border-border hover:bg-accent transition-colors"
          >
            Profil ansehen
          </Link>
        </div>

        <DropdownMenuSeparator className="my-0" />

        {/* Business account */}
        <div className="p-1">
          {business ? (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href={`/app/gewerbe/${business.slug}`} className="flex items-center gap-2">
                {business.logo_url ? (
                  <img
                    src={business.logo_url}
                    alt={business.name}
                    className="h-4 w-4 rounded object-cover"
                  />
                ) : (
                  <Store className="h-4 w-4" />
                )}
                <span>{business.name}</span>
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/app/gewerbe/erstellen" className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                <span>Unternehmensseite hinzufügen</span>
              </Link>
            </DropdownMenuItem>
          )}
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
