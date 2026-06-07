"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminUserRow } from "@/app/actions/users-admin";
import { UserDetailSheet } from "./user-detail-sheet";
import { UsersTableView } from "./users-table-view";

const numberFmt = new Intl.NumberFormat("de-DE");

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
      <UsersTableView rows={filtered} onSelect={setSelected} />

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
