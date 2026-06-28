"use client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { BadgeCheck } from "lucide-react";

export interface MemberRowData {
  name: string;
  username: string | null;
  avatarUrl: string | null;
  verified: boolean;
  isYou?: boolean;
}

/** Initials from a display name (handles German umlauts; falls back to "?"). */
export function initials(name: string): string {
  const parts = name.replace(/[^\p{L} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  const s = parts.map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return s || "?";
}

export function MemberRow({ m, size = "md" }: { m: MemberRowData; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar className={`${dim} shrink-0`}>
        {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.name} />}
        <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{m.name}</span>
          {m.verified && <BadgeCheck className="h-4 w-4 text-[#00498B] shrink-0" aria-label="verifiziert" />}
          {m.isYou && <span className="text-xs text-[#00498B] shrink-0">(Du)</span>}
        </div>
        {m.username && <p className="text-xs text-muted-foreground truncate">@{m.username}</p>}
      </div>
    </div>
  );
}
