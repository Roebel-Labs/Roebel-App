"use client";

import Image from "next/image";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { ReactNode } from "react";

interface ProfileHeroAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface ProfileHeroProps {
  name: string;
  coverUrl?: string | null;
  avatarUrl?: string | null;
  /** Avatar corner style — orgs read better as a rounded square, people as a circle. */
  avatarShape?: "circle" | "rounded";
  /** Pill rendered next to the name (e.g. RoleBadge or a sub-type label). */
  pill?: ReactNode;
  /** Shows a verified check next to the name. */
  verified?: boolean;
  bio?: string | null;
  /** Secondary meta row under the name (neighborhood, membership age, …). */
  meta?: ReactNode;
  action?: ProfileHeroAction;
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function ProfileHero({
  name,
  coverUrl,
  avatarUrl,
  avatarShape = "circle",
  pill,
  verified = false,
  bio,
  meta,
  action,
}: ProfileHeroProps) {
  const radius = avatarShape === "rounded" ? "rounded-2xl" : "rounded-full";

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden mb-3 sm:mb-4">
      {/* Cover */}
      <div className="relative h-32 sm:h-44 bg-gradient-to-br from-muted to-muted-foreground/20">
        {coverUrl && (
          <Image src={coverUrl} alt="" fill className="object-cover" />
        )}
      </div>

      {/* Info */}
      <div className="px-4 sm:px-6 pb-4 sm:pb-5">
        {/* Avatar overlapping cover */}
        <div className="-mt-10 sm:-mt-12 mb-3">
          <div
            className={`w-20 h-20 sm:w-24 sm:h-24 ${radius} border-4 border-card bg-muted overflow-hidden relative flex items-center justify-center`}
          >
            {avatarUrl ? (
              <Image src={avatarUrl} alt={name} fill className="object-cover" />
            ) : (
              <span className="text-2xl font-semibold text-muted-foreground">
                {initialOf(name)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <h1 className="text-lg sm:text-xl font-semibold text-foreground truncate">
                {name}
              </h1>
              {verified && (
                <BadgeCheck className="w-4 h-4 text-primary shrink-0" />
              )}
              {pill}
            </div>

            {meta && (
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                {meta}
              </div>
            )}

            {bio && <p className="text-sm text-foreground mt-2">{bio}</p>}
          </div>

          {action &&
            (action.href ? (
              <Link
                href={action.href}
                className="shrink-0 px-3 py-1.5 text-xs font-medium bg-card border border-border hover:bg-accent text-foreground rounded-lg transition-colors"
              >
                {action.label}
              </Link>
            ) : (
              <button
                onClick={action.onClick}
                className="shrink-0 px-3 py-1.5 text-xs font-medium bg-card border border-border hover:bg-accent text-foreground rounded-lg transition-colors"
              >
                {action.label}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
