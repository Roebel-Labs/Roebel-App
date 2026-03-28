"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface HorizontalRowProps {
  title: string;
  href?: string;
  linkLabel?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function HorizontalRow({
  title,
  href,
  linkLabel = "Alle ansehen",
  icon,
  children,
}: HorizontalRowProps) {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {href && (
          <Link
            href={href}
            className="flex items-center gap-0.5 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            {linkLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex gap-3 overflow-x-auto px-4 pb-4 snap-x snap-mandatory scrollbar-hide">
        {children}
      </div>
    </div>
  );
}
