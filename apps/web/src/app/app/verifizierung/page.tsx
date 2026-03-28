"use client";

import { useActiveAccount } from "thirdweb/react";
import { useVerificationStatus } from "@/hooks/useVerificationStatus";
import Link from "next/link";
import { de } from "@/lib/translations/de";

export default function VerificationDashboard() {
  const account = useActiveAccount();
  const { isAttester, isCitizen, votingPower, isLoading } = useVerificationStatus();

  return (
    <div className="space-y-4 sm:space-y-6">
        <div className="max-w-6xl mx-auto">

          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl font-medium text-foreground">{de.verification.title}</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">{de.verification.subtitle}</p>
          </div>

          {!account ? (
            <div className="bg-card border border-border rounded-xl shadow-sm p-6 sm:p-12 text-center">
              <p className="text-sm sm:text-base text-muted-foreground mb-4">{de.common.connectWallet}</p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              {/* Mein Status */}
              <div className="bg-card border border-border rounded-xl shadow-sm p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-medium text-foreground mb-4">Mein Status</h2>

                {isLoading ? (
                  <div className="text-center py-4">
                    <div className="inline-block w-6 h-6 border-4 border-black border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {isAttester && (
                      <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <span className="text-sm font-medium text-blue-900">
                          {de.verification.isAttester}
                        </span>
                        <span className="text-2xl">✓</span>
                      </div>
                    )}

                    {isCitizen && (
                      <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                        <span className="text-sm font-medium text-green-900">
                          {de.verification.isCitizen}
                        </span>
                        <span className="text-2xl">✓</span>
                      </div>
                    )}

                    {isCitizen && (
                      <div className="mt-3 p-3 bg-muted border border-border rounded-lg">
                        <div className="text-xs text-muted-foreground mb-1">{de.proposals.votingPower}</div>
                        <div className="text-2xl font-medium text-foreground">{votingPower}</div>
                      </div>
                    )}

                    {!isAttester && !isCitizen && (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground text-sm">{de.verification.notVerified}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Schnellzugriff - 3 Column Row */}
              <div className="bg-card border border-border rounded-xl shadow-sm p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-medium text-foreground mb-4 sm:mb-6">Schnellzugriff</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {!isCitizen && (
                    <Link
                      href="/app/verifizierung/buerger-beantragen"
                      className="flex flex-col p-4 sm:p-6 border-2 border-border rounded-lg hover:border-black hover:shadow-md transition-all group active:scale-95"
                    >
                      <h3 className="text-base sm:text-lg font-medium text-foreground mb-2 group-hover:text-primary transition-colors">
                        {de.verification.requestCitizenNFT}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground flex-1">
                        Werde ein verifiziertes Mitglied der Röbel/Müritz Community
                      </p>
                      <div className="mt-3 sm:mt-4 text-xs sm:text-sm font-medium text-foreground">
                        Jetzt beantragen
                      </div>
                    </Link>
                  )}

                  {!isAttester && (
                    <Link
                      href="/app/verifizierung/bescheiniger-beantragen"
                      className="flex flex-col p-4 sm:p-6 border-2 border-border rounded-lg hover:border-black hover:shadow-md transition-all group active:scale-95"
                    >
                      <h3 className="text-base sm:text-lg font-medium text-foreground mb-2 group-hover:text-primary transition-colors">
                        {de.verification.requestAttesterNFT}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground flex-1">
                        Hilf bei der Verifizierung neuer Community-Mitglieder
                      </p>
                      <div className="mt-3 sm:mt-4 text-xs sm:text-sm font-medium text-foreground">
                        Jetzt beantragen
                      </div>
                    </Link>
                  )}

                  {(isAttester || isCitizen) && (
                    <Link
                      href="/app/verifizierung/antraege"
                      className="flex flex-col p-4 sm:p-6 border-2 border-border rounded-lg hover:border-black hover:shadow-md transition-all group active:scale-95"
                    >
                      <h3 className="text-base sm:text-lg font-medium text-foreground mb-2 group-hover:text-primary transition-colors">
                        Anträge prüfen
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground flex-1">
                        Unterschreibe offene Verifizierungs-Anträge
                      </p>
                      <div className="mt-3 sm:mt-4 text-xs sm:text-sm font-medium text-foreground">
                        Anträge ansehen
                      </div>
                    </Link>
                  )}
                </div>
              </div>

              {/* How it Works */}
              <div className="bg-muted border border-border rounded-xl shadow-sm p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-medium mb-3 sm:mb-4 text-foreground">So funktioniert die Verifizierung</h3>
                <div className="space-y-2.5 sm:space-y-3 text-foreground text-xs sm:text-sm">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="font-medium flex-shrink-0">1.</span>
                    <span>Erstelle einen Verifizierungs-Antrag mit deinen Daten und einem Nachweis</span>
                  </div>
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="font-medium flex-shrink-0">2.</span>
                    <span>Bescheiniger und Bürger prüfen deinen Antrag und unterschreiben</span>
                  </div>
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="font-medium flex-shrink-0">3.</span>
                    <span>Nach ausreichend Unterschriften und Genehmigung erhältst du deinen Bürger-Pass</span>
                  </div>
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="font-medium flex-shrink-0">4.</span>
                    <span>Als Bürger kannst du an Abstimmungen teilnehmen und neue Mitglieder verifizieren</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
