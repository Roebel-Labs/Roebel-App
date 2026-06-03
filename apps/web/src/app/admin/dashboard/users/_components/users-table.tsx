"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Search, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminUserRow } from "@/app/actions/users-admin";
import {
  formatWalletAddress,
  getRoleInfo,
  getUserDisplayName,
} from "@/lib/user-types";
import { UserDetailSheet } from "./user-detail-sheet";

const numberFmt = new Intl.NumberFormat("de-DE");

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const TIER_LABELS: Record<string, string> = {
  citizen: "Bürger",
  tourist: "Gast",
  guest: "Gast",
};

const VERIFICATION: Record<
  string,
  { label: string; variant: "pending" | "success" | "error" }
> = {
  pending: { label: "Ausstehend", variant: "pending" },
  approved: { label: "Verifiziert", variant: "success" },
  rejected: { label: "Abgelehnt", variant: "error" },
};

type SortKey = "created_at" | "points" | "votes" | "last_login";

export function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [selected, setSelected] = useState<AdminUserRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = rows.filter((r) => {
      if (tierFilter !== "all" && r.tier !== tierFilter) return false;
      if (statusFilter !== "all" && r.verification_status !== statusFilter)
        return false;
      if (!q) return true;
      return (
        (r.username ?? "").toLowerCase().includes(q) ||
        (r.display_name ?? "").toLowerCase().includes(q) ||
        r.wallet_address.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q)
      );
    });

    const sorted = [...result];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "points":
          return (b.points_balance ?? 0) - (a.points_balance ?? 0);
        case "votes":
          return b.total_votes_cast - a.total_votes_cast;
        case "last_login":
          return (
            new Date(b.last_login_at ?? 0).getTime() -
            new Date(a.last_login_at ?? 0).getTime()
          );
        case "created_at":
        default:
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
      }
    });
    return sorted;
  }, [rows, query, tierFilter, statusFilter, sortKey]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suchen (Name, Wallet, E-Mail)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Stufe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Stufen</SelectItem>
              <SelectItem value="citizen">Bürger</SelectItem>
              <SelectItem value="tourist">Gast (Tourist)</SelectItem>
              <SelectItem value="guest">Gast</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="pending">Ausstehend</SelectItem>
              <SelectItem value="approved">Verifiziert</SelectItem>
              <SelectItem value="rejected">Abgelehnt</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sortKey}
            onValueChange={(v) => setSortKey(v as SortKey)}
          >
            <SelectTrigger className="w-[170px]">
              <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
              <SelectValue placeholder="Sortieren" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">Neueste zuerst</SelectItem>
              <SelectItem value="last_login">Zuletzt aktiv</SelectItem>
              <SelectItem value="points">Meiste Punkte</SelectItem>
              <SelectItem value="votes">Meiste Stimmen</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
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
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Keine Nutzer gefunden.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const tierInfo = getRoleInfo(r.tier);
                const status =
                  VERIFICATION[r.verification_status] ?? VERIFICATION.pending;
                return (
                  <tr
                    key={r.wallet_address}
                    onClick={() => setSelected(r)}
                    className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-accent/40"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          {r.profile_picture_url && (
                            <AvatarImage
                              src={r.profile_picture_url}
                              alt={getUserDisplayName(r)}
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
                            {r.is_verified_citizen && (
                              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#194383]" />
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

      <p className="text-xs text-muted-foreground">
        {numberFmt.format(filtered.length)} von {numberFmt.format(rows.length)}{" "}
        Nutzern
      </p>

      <UserDetailSheet
        user={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
