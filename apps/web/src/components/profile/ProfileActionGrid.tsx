"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface ProfileAction {
  label: string;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
}

function Tile({ action }: { action: ProfileAction }) {
  const Icon = action.icon;
  const inner = (
    <>
      <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-primary/10 text-primary mb-2">
        <Icon className="w-5 h-5" />
      </span>
      <span className="text-xs font-medium text-foreground text-center leading-tight">
        {action.label}
      </span>
    </>
  );

  const className =
    "flex flex-col items-center justify-start p-3 rounded-xl bg-card border border-border hover:bg-accent transition-colors active:scale-95";

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={className}>
      {inner}
    </button>
  );
}

export function ProfileActionGrid({ actions }: { actions: ProfileAction[] }) {
  if (actions.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
      {actions.map((action) => (
        <Tile key={action.label} action={action} />
      ))}
    </div>
  );
}
