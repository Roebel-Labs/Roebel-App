"use client";

import { ExternalLink, History } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROTATION_HISTORY, basescanAddress } from "@/lib/maci-config";

const KIND_LABEL: Record<string, string> = {
  governor: "Governor",
  timelock: "Timelock",
  vkRegistry: "VkRegistry",
};

function shortAddr(a: string): string {
  if (a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RotationHistoryCard() {
  // Most recent rotations first.
  const sorted = [...ROTATION_HISTORY].sort((a, b) =>
    b.archivedAt.localeCompare(a.archivedAt),
  );

  return (
    <Card className="bg-card border border-border shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          Rotation-Historie
        </CardTitle>
        <CardDescription>
          Archivierte Governor-/Timelock-/VkRegistry-Adressen mit dem Grund der
          Rotation. Auf Basescan zur Audit-Verifikation einsehbar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {sorted.map((entry) => (
            <li
              key={`${entry.kind}-${entry.address}`}
              className="rounded-md border border-border bg-muted/20 px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-medium">
                    {KIND_LABEL[entry.kind] ?? entry.kind}
                  </Badge>
                  <a
                    href={basescanAddress(entry.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs hover:underline"
                  >
                    {shortAddr(entry.address)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(entry.archivedAt)}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {entry.reason}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
