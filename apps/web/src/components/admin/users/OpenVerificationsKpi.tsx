"use client";

import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOpenVerifications } from "@/hooks/useOpenVerifications";

/**
 * KPI card showing the live on-chain count of open (pending) verification
 * requests (attester + citizen) — the real source, same as the DAO page.
 */
export function OpenVerificationsKpi() {
  const { pending, isLoading, error } = useOpenVerifications();

  return (
    <Card className="bg-card border border-border shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Offene Verifizierungen
        </CardTitle>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-12" />
        ) : error ? (
          <div className="text-2xl font-medium text-muted-foreground">—</div>
        ) : (
          <div className="text-2xl font-medium">{pending ?? 0}</div>
        )}
        <p className="text-xs text-muted-foreground">
          {error ? "On-Chain nicht erreichbar" : "On-Chain Anträge (live)"}
        </p>
      </CardContent>
    </Card>
  );
}
