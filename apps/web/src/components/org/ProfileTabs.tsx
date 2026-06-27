"use client";

import { cn } from "@/lib/utils";

export interface ProfileTab<K extends string = string> {
  key: K;
  label: string;
  count?: number;
}

interface ProfileTabsProps<K extends string> {
  tabs: ProfileTab<K>[];
  active: K;
  onChange: (key: K) => void;
}

export function ProfileTabs<K extends string>({
  tabs,
  active,
  onChange,
}: ProfileTabsProps<K>) {
  return (
    <div className="flex items-center gap-6 border-b border-border px-1">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "relative -mb-px py-3 text-sm font-medium transition-colors",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {typeof tab.count === "number" && tab.count > 0 && (
                <span className="text-xs text-muted-foreground">{tab.count}</span>
              )}
            </span>
            {isActive && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
