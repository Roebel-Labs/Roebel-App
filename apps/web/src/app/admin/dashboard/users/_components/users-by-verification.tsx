"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  ShieldQuestion,
  Users as UsersIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminUserRow } from "@/app/actions/users-admin";
import { UserDetailSheet } from "./user-detail-sheet";
import { UsersTableView } from "./users-table-view";

const numberFmt = new Intl.NumberFormat("de-DE");

interface Group {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string; // tailwind text color for the icon
  rows: AdminUserRow[];
  emptyLabel: string;
}

function GroupSection({
  group,
  defaultOpen,
  onSelect,
}: {
  group: Group;
  defaultOpen: boolean;
  onSelect: (row: AdminUserRow) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = group.icon;

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/40"
      >
        <Icon className={`h-5 w-5 shrink-0 ${group.accent}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium">
            {group.label}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
              {numberFmt.format(group.rows.length)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{group.description}</p>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border p-3">
          <UsersTableView
            rows={group.rows}
            onSelect={onSelect}
            emptyLabel={group.emptyLabel}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Splits all users into three verification-based groups (separate tables):
 *  1. Verifizierte Bürger — hold the Citizen NFT on-chain.
 *  2. Bürger – nicht verifiziert — picked "Bürger" in the app onboarding
 *     (tier=citizen) but have not completed on-chain verification yet. Those who
 *     already created a request appear in "Offene Verifizierungsanträge".
 *  3. Gäste & Touristen — everyone else (default onboarding tier).
 */
export function UsersByVerification({ rows }: { rows: AdminUserRow[] }) {
  const [selected, setSelected] = useState<AdminUserRow | null>(null);

  const groups = useMemo<Group[]>(() => {
    const verified: AdminUserRow[] = [];
    const aspiring: AdminUserRow[] = [];
    const guests: AdminUserRow[] = [];

    for (const r of rows) {
      if (r.is_verified_citizen) {
        verified.push(r);
      } else if (r.tier === "citizen") {
        aspiring.push(r);
      } else {
        guests.push(r);
      }
    }

    return [
      {
        key: "verified",
        label: "Verifizierte Bürger",
        description: "Halten das Bürger-NFT (on-chain verifiziert).",
        icon: ShieldCheck,
        accent: "text-[#00498B]",
        rows: verified,
        emptyLabel: "Noch keine verifizierten Bürger.",
      },
      {
        key: "aspiring",
        label: "Bürger – nicht verifiziert",
        description:
          "Im Onboarding „Bürger“ gewählt, aber noch nicht on-chain verifiziert.",
        icon: ShieldQuestion,
        accent: "text-amber-500",
        rows: aspiring,
        emptyLabel: "Keine unverifizierten Bürger.",
      },
      {
        key: "guests",
        label: "Gäste & Touristen",
        description: "Standard-Stufe nach dem Onboarding.",
        icon: UsersIcon,
        accent: "text-muted-foreground",
        rows: guests,
        emptyLabel: "Keine Gäste.",
      },
    ];
  }, [rows]);

  return (
    <div className="space-y-3">
      {groups.map((group, i) => (
        <GroupSection
          key={group.key}
          group={group}
          defaultOpen={i === 0}
          onSelect={setSelected}
        />
      ))}

      <UserDetailSheet
        user={selected}
        open={selected !== null}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
      />
    </div>
  );
}
