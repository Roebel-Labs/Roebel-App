"use client";

import { cn } from "@/lib/utils";

export interface AvatarStackUser {
  avatar_url: string | null;
  username: string | null;
}

interface AvatarStackProps {
  users: AvatarStackUser[];
  maxVisible?: number;
  totalCount?: number;
  size?: "small" | "large";
}

const SIZES = {
  small: "h-7 w-7 text-[10px]",
  large: "h-9 w-9 text-xs",
};

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase();
}

export function AvatarStack({
  users,
  maxVisible = 3,
  totalCount,
  size = "large",
}: AvatarStackProps) {
  const visible = users.slice(0, maxVisible);
  const total = totalCount ?? users.length;
  const overflow = total - visible.length;
  const sizeClass = SIZES[size];

  return (
    <div className="flex items-center">
      {visible.map((u, i) => (
        <div
          key={i}
          className={cn(
            "relative flex items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted font-medium text-muted-foreground",
            sizeClass,
            i > 0 && "-ml-2"
          )}
        >
          {u.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={u.avatar_url}
              alt={u.username ?? ""}
              className="h-full w-full object-cover"
            />
          ) : (
            initials(u.username)
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className={cn(
            "-ml-2 flex items-center justify-center rounded-full border-2 border-background bg-muted font-medium text-muted-foreground",
            sizeClass
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
