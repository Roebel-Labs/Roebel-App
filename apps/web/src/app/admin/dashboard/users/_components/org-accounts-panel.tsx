"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { AdminOrgRow } from "@/app/actions/orgs-admin";
import { formatWalletAddress } from "@/lib/user-types";
import {
  SUB_TYPE_EMOJI,
  SUB_TYPE_LABELS,
  type OrgRole,
} from "@/types/account";
import { resolveEntry, type Directory } from "../_lib/directory";

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Inhaber",
  admin: "Admin",
  member: "Mitglied",
};

const ROLE_VARIANT: Record<OrgRole, "info" | "secondary" | "outline"> = {
  owner: "info",
  admin: "secondary",
  member: "outline",
};

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function OrgCard({
  org,
  directory,
}: {
  org: AdminOrgRow;
  directory: Directory;
}) {
  const [open, setOpen] = useState(false);
  const emoji = org.sub_type ? SUB_TYPE_EMOJI[org.sub_type] : "🏢";
  const typeLabel = org.sub_type
    ? SUB_TYPE_LABELS[org.sub_type]
    : "Organisation";

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/40"
      >
        <Avatar className="h-9 w-9 shrink-0">
          {org.avatar_url && (
            <AvatarImage src={org.avatar_url} alt={org.name} />
          )}
          <AvatarFallback className="text-sm">{emoji}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 font-medium">
            <span className="truncate max-w-[220px]">{org.name}</span>
            {org.is_verified && <Badge variant="success">Verifiziert</Badge>}
            {org.is_extern && (
              <Badge
                variant={
                  org.extern_status === "approved"
                    ? "success"
                    : org.extern_status === "rejected"
                      ? "error"
                      : "warning"
                }
              >
                Extern{org.extern_status ? ` · ${org.extern_status}` : ""}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {emoji} {typeLabel} · seit {formatDate(org.created_at)}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {org.members.length}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2">
          {org.members.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Keine Mitglieder.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {org.members.map((m) => {
                const entry = resolveEntry(directory, m.wallet_address);
                const name =
                  entry?.name ?? formatWalletAddress(m.wallet_address);
                return (
                  <li
                    key={m.wallet_address}
                    className="flex items-center gap-2.5 py-2"
                  >
                    <Avatar className="h-7 w-7 shrink-0">
                      {entry?.avatar && (
                        <AvatarImage src={entry.avatar} alt={name} />
                      )}
                      <AvatarFallback className="text-[10px]">
                        {(entry?.username ?? m.wallet_address)
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {name}
                        {!entry && (
                          <span className="ml-1 text-xs italic text-muted-foreground/70">
                            (kein Profil)
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {formatWalletAddress(m.wallet_address)}
                      </div>
                    </div>
                    <Badge variant={ROLE_VARIANT[m.role]}>
                      {ROLE_LABELS[m.role]}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * All organisation accounts and who belongs to each. Members are resolved to
 * names via the directory built server-side from the user rows.
 */
export function OrgAccountsPanel({
  orgs,
  directory,
  error,
}: {
  orgs: AdminOrgRow[];
  directory: Directory;
  error?: string;
}) {
  if (error) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Organisationen konnten nicht geladen werden: {error}
      </p>
    );
  }

  if (orgs.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Noch keine Organisationskonten.
      </p>
    );
  }

  const totalMembers = new Set(
    orgs.flatMap((o) => o.members.map((m) => m.wallet_address))
  ).size;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {orgs.length} Organisation{orgs.length === 1 ? "" : "en"} ·{" "}
        {totalMembers} eindeutige Mitglieder.
      </p>
      <div className="space-y-2">
        {orgs.map((org) => (
          <OrgCard key={org.id} org={org} directory={directory} />
        ))}
      </div>
    </div>
  );
}
