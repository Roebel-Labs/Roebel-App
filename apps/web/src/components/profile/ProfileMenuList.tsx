"use client";

import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

export interface ProfileMenuItem {
  label: string;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
  /** Optional value/status shown on the right, before the chevron. */
  trailing?: string;
}

function MenuRow({ item }: { item: ProfileMenuItem }) {
  const Icon = item.icon;
  const inner = (
    <>
      <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm font-medium text-foreground text-left">
        {item.label}
      </span>
      {item.trailing && (
        <span className="text-xs text-muted-foreground">{item.trailing}</span>
      )}
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </>
  );

  const className =
    "w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors";

  if (item.href) {
    return (
      <Link href={item.href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={item.onClick} className={className}>
      {inner}
    </button>
  );
}

/** Grouped menu rows; each inner array is a visually separated group. */
export function ProfileMenuList({ groups }: { groups: ProfileMenuItem[][] }) {
  const visibleGroups = groups.filter((g) => g.length > 0);
  if (visibleGroups.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden mb-3 sm:mb-4 divide-y divide-border">
      {visibleGroups.map((group, gi) => (
        <div key={gi} className="divide-y divide-border">
          {group.map((item) => (
            <MenuRow key={item.label} item={item} />
          ))}
        </div>
      ))}
    </div>
  );
}
