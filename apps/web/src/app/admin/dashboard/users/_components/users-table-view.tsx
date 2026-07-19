"use client";

import { ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { AdminUserRow } from "@/app/actions/users-admin";
import {
  formatWalletAddress,
  getRoleInfo,
  type UserRoleOrTier,
} from "@/lib/user-types";

const numberFmt = new Intl.NumberFormat("de-DE");

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export const TIER_LABELS: Record<string, string> = {
  citizen: "Bürger",
  tourist: "Gast",
  guest: "Gast",
};

export const VERIFICATION: Record<
  string,
  { label: string; variant: "pending" | "success" | "error" }
> = {
  pending: { label: "Ausstehend", variant: "pending" },
  approved: { label: "Verifiziert", variant: "success" },
  rejected: { label: "Abgelehnt", variant: "error" },
};

/**
 * Presentational users table — shared by the searchable "Alle Nutzer" table and
 * the verification-grouped tables. Rendering only; the parent owns filtering,
 * sorting and the detail sheet.
 */
export function UsersTableView({
  rows,
  onSelect,
  emptyLabel = "Keine Nutzer gefunden.",
}: {
  rows: AdminUserRow[];
  onSelect: (row: AdminUserRow) => void;
  emptyLabel?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">Nutzer</th>
            <th className="px-3 py-2.5 font-medium">Stufe</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Ortsteil</th>
            <th className="px-3 py-2.5 text-right font-medium">Punkte</th>
            <th className="px-3 py-2.5 text-right font-medium">Stimmen</th>
            <th className="px-3 py-2.5 font-medium">Beigetreten</th>
            <th className="px-3 py-2.5 font-medium">Zuletzt aktiv</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={8}
                className="px-3 py-8 text-center text-muted-foreground"
              >
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const tierInfo = getRoleInfo(r.tier as UserRoleOrTier);
              const status =
                VERIFICATION[r.verification_status] ?? VERIFICATION.pending;
              return (
                <tr
                  key={r.wallet_address}
                  onClick={() => onSelect(r)}
                  className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-accent/40"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8">
                        {r.profile_picture_url && (
                          <AvatarImage
                            src={r.profile_picture_url}
                            alt={
                              r.username ||
                              r.display_name ||
                              formatWalletAddress(r.wallet_address)
                            }
                          />
                        )}
                        <AvatarFallback className="text-xs">
                          {(r.username ?? r.wallet_address)
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 font-medium">
                          <span className="truncate max-w-[160px]">
                            {r.username ||
                              r.display_name ||
                              formatWalletAddress(r.wallet_address)}
                          </span>
                          {r.verified_effective && (
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#00498B]" />
                          )}
                          {r.is_verified_citizen &&
                            r.holds_citizen_nft === false && (
                              <span className="inline-flex shrink-0 rounded-full border border-amber-300 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                NFT fehlt
                              </span>
                            )}
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatWalletAddress(r.wallet_address)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tierInfo.bgColor} ${tierInfo.textColor} ${tierInfo.borderColor}`}
                    >
                      {TIER_LABELS[r.tier] ?? tierInfo.labelDe}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {r.neighborhood ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.points_balance === null
                      ? "—"
                      : numberFmt.format(r.points_balance)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {numberFmt.format(r.total_votes_cast)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatDate(r.last_login_at)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
