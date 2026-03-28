"use client";

import { useVerificationStatus } from "@/hooks/useVerificationStatus";
import Link from "next/link";

export function VerificationStatusCard() {
  const { isAttester, isCitizen, isLoading } = useVerificationStatus();

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4" />
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-24 bg-muted rounded" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-6">
      <h3 className="text-xl font-medium text-foreground mb-4">
        🎫 Verifizierungsstatus
      </h3>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Attester NFT Status */}
        <div
          className={`p-4 rounded-lg border ${
            isAttester
              ? "bg-green-50 border-green-200"
              : "bg-muted border-border"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-lg font-medium text-foreground">Bescheiniger</h4>
            <span className="text-2xl">{isAttester ? "✅" : "❌"}</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {isAttester
              ? "Du bist ein verifizierter Bescheiniger und kannst neue Bürger attestieren."
              : "Du bist kein Bescheiniger. Nur Bescheiniger können neue Mitglieder verifizieren."}
          </p>
          {!isAttester && (
            <Link
              href="/verifizierung/bescheiniger"
              className="inline-block text-sm text-primary hover:text-primary/80 transition-colors"
            >
              Bescheiniger werden →
            </Link>
          )}
        </div>

        {/* Citizen NFT Status */}
        <div
          className={`p-4 rounded-lg border ${
            isCitizen
              ? "bg-green-50 border-green-200"
              : "bg-muted border-border"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-lg font-medium text-foreground">Bürger</h4>
            <span className="text-2xl">{isCitizen ? "✅" : "❌"}</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {isCitizen
              ? "Du bist ein verifizierter Bürger mit vollem Stimmrecht in der DAO."
              : "Du bist noch kein verifizierter Bürger. Beantrage eine Verifizierung."}
          </p>
          {!isCitizen && (
            <Link
              href="/verifizierung/buerger"
              className="inline-block text-sm text-primary hover:text-primary/80 transition-colors"
            >
              Bürger werden →
            </Link>
          )}
        </div>
      </div>

      {/* Info Box */}
      {!isAttester && !isCitizen && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">
            💡 <strong>Hinweis:</strong> Um an der DAO teilzunehmen, benötigst
            du ein Bürger-NFT. Bescheiniger-NFTs sind nur für die Verifizierung
            neuer Mitglieder erforderlich.
          </p>
        </div>
      )}
    </div>
  );
}
