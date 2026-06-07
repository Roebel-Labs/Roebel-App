import { ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { AdminUserRow } from "@/app/actions/users-admin";
import {
  formatWalletAddress,
  getRoleInfo,
  type UserRoleOrTier,
} from "@/lib/user-types";

const DAY_MS = 24 * 60 * 60 * 1000;

const TIER_LABELS: Record<string, string> = {
  citizen: "Bürger",
  tourist: "Gast",
  guest: "Gast",
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Users registered in the last 7 days (rolling), newest first. Computed from the
 * already-fetched admin rows — no extra query.
 */
export function RegisteredThisWeek({ rows }: { rows: AdminUserRow[] }) {
  const cutoff = Date.now() - 7 * DAY_MS;
  const recent = rows
    .filter((r) => new Date(r.created_at).getTime() >= cutoff)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  if (recent.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Diese Woche keine neuen Registrierungen.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {recent.length} neue{recent.length === 1 ? "r" : ""} Nutzer in den
        letzten 7 Tagen.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {recent.map((r) => {
          const tierInfo = getRoleInfo(r.tier as UserRoleOrTier);
          const name =
            r.username ||
            r.display_name ||
            formatWalletAddress(r.wallet_address);
          return (
            <li
              key={r.wallet_address}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <Avatar className="h-8 w-8 shrink-0">
                {r.profile_picture_url && (
                  <AvatarImage src={r.profile_picture_url} alt={name} />
                )}
                <AvatarFallback className="text-xs">
                  {(r.username ?? r.wallet_address).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 font-medium">
                  <span className="truncate max-w-[180px]">{name}</span>
                  {r.is_verified_citizen && (
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#194383]" />
                  )}
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatWalletAddress(r.wallet_address)}
                  {r.neighborhood ? ` · ${r.neighborhood}` : ""}
                </span>
              </div>
              <span
                className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium sm:inline-flex ${tierInfo.bgColor} ${tierInfo.textColor} ${tierInfo.borderColor}`}
              >
                {TIER_LABELS[r.tier] ?? tierInfo.labelDe}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatDateTime(r.created_at)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
