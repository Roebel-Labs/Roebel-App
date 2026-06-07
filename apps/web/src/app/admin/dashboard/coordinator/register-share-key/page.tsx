"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  useActiveAccount,
  useReadContract,
  ConnectButton,
} from "thirdweb/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import { wallets } from "@/lib/wallet-config";
import { attesterNFTContract } from "@/lib/verification-contracts";
import {
  SHARE_KEY_CHALLENGE,
  bytesToBase64,
  bytesToHex,
  deriveShareKeypairFromSignature,
} from "@/lib/shamir/wallet-encryption";

type Stage = "idle" | "signing" | "deriving" | "submitting" | "done" | "error";

export default function RegisterShareKeyPage() {
  const account = useActiveAccount();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [registeredPubkey, setRegisteredPubkey] = useState<string | null>(null);

  const { data: isAttester, isLoading: attesterLoading } = useReadContract({
    contract: attesterNFTContract,
    method: "function hasAttesterNFT(address account) view returns (bool)",
    params: [account?.address ?? "0x0000000000000000000000000000000000000000"],
    queryOptions: { enabled: !!account },
  });

  const handleRegister = useCallback(async () => {
    if (!account) return;
    setError(null);
    try {
      setStage("signing");
      const signature = await account.signMessage({
        message: SHARE_KEY_CHALLENGE,
      });

      setStage("deriving");
      const kp = await deriveShareKeypairFromSignature(signature);
      const curve25519PubkeyBase64 = bytesToBase64(kp.publicKey);

      setStage("submitting");
      const res = await fetch("/api/coordinator/share-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: account.address,
          challenge: SHARE_KEY_CHALLENGE,
          signature,
          curve25519PubkeyBase64,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setRegisteredPubkey(bytesToHex(kp.publicKey));
      setStage("done");
    } catch (err) {
      console.error("[register-share-key]", err);
      setError(err instanceof Error ? err.message : String(err));
      setStage("error");
    }
  }, [account]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-foreground">
          Share-Key registrieren
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Einmaliger Schritt für alle Bescheiniger. Du registrierst einen aus
          deiner Wallet abgeleiteten Verschlüsselungs-Schlüssel, damit der
          Founder dir später deinen Shamir-Anteil verschlüsselt zustellen kann.
          Der private Schlüssel verlässt nie deinen Browser.
        </p>
      </div>

      {!account ? (
        <Card>
          <CardHeader>
            <CardTitle>Wallet verbinden</CardTitle>
            <CardDescription>
              Verbinde deine Bescheiniger-Wallet, um fortzufahren.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectButton
              client={client}
              chain={activeChain}
              wallets={wallets}
              connectModal={{ title: "Bei Röbel/Müritz DAO anmelden", size: "compact" }}
            />
          </CardContent>
        </Card>
      ) : attesterLoading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Prüfe Bescheiniger-Status…
          </CardContent>
        </Card>
      ) : !isAttester ? (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">
              Nur für Bescheiniger verfügbar
            </CardTitle>
            <CardDescription className="text-red-800">
              Diese Wallet (<code className="text-xs">{account.address}</code>)
              hält keinen AttesterNFT. Nur die 5 Bescheiniger dürfen einen
              Share-Key registrieren.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : stage === "done" ? (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge className="bg-green-600 text-white hover:bg-green-700">
                ✓ Registriert
              </Badge>
              <CardTitle className="text-green-900">
                Share-Key erfolgreich registriert
              </CardTitle>
            </div>
            <CardDescription className="text-green-800">
              Dein öffentlicher Curve25519-Schlüssel ist jetzt auf Supabase
              hinterlegt. Der Founder kann dir Shamir-Anteile sicher zustellen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-green-900 font-mono break-all bg-white border border-green-200 rounded p-3">
              {registeredPubkey}
            </div>
            <Link
              href="/admin/dashboard/coordinator"
              className="text-sm text-green-900 underline hover:text-green-950"
            >
              ← Zurück zur Coordinator-Übersicht
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Registrierung</CardTitle>
            <CardDescription>
              Klick auf <strong>Registrieren</strong>. Deine Wallet wird die
              folgende Nachricht signieren — daraus leiten wir deinen
              Verschlüsselungs-Schlüssel ab. Selbe Nachricht → selber Schlüssel,
              jedes Mal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-xs font-mono bg-muted border border-border rounded p-3 break-all">
              {SHARE_KEY_CHALLENGE}
            </div>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                {error}
              </div>
            )}

            <Button
              type="button"
              onClick={handleRegister}
              disabled={stage !== "idle" && stage !== "error"}
              className="w-full"
            >
              {stage === "idle" || stage === "error"
                ? "Registrieren"
                : stage === "signing"
                ? "Signiere…"
                : stage === "deriving"
                ? "Schlüssel ableiten…"
                : stage === "submitting"
                ? "An Supabase senden…"
                : "Fertig"}
            </Button>

            <p className="text-xs text-muted-foreground">
              Sicherheitshinweis: Ändere niemals dein Wallet, ohne dich
              vorher neu zu registrieren. Wenn du das Wallet verlierst,
              verlierst du deinen Anteil — du kannst aber jederzeit aus der
              Shareholder-Liste rotieren werden.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
