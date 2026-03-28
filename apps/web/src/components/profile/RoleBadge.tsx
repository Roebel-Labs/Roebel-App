"use client";

import type { UserRole } from "@/lib/user-types";
import { getRoleInfo } from "@/lib/user-types";

interface RoleBadgeProps {
  role: UserRole;
  size?: "sm" | "md";
}

export function RoleBadge({ role, size = "sm" }: RoleBadgeProps) {
  const info = getRoleInfo(role);

  return (
    <span
      className={`inline-flex items-center border rounded-full font-medium ${info.bgColor} ${info.textColor} ${info.borderColor} ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
    >
      {info.labelDe}
    </span>
  );
}
