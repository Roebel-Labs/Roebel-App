"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useActiveAccount, useReadContract } from "thirdweb/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { attesterNFTContract } from "@/lib/verification-contracts";
import {
  type EncryptedShareRow,
  type SessionManifest,
  type SessionRow,
  decryptShareForCurrentWallet,
  signSubmission,
  submitShareToReconstructor,
  verifySessionManifestFull,
} from "@/lib/shamir/tally-session";
import { TallyPipeline, type CurrentStage } from "@/components/admin/TallyPipeline";

type StateData = {
  session: SessionRow;
  generation: {
    id: string;
    threshold: number;
    total_shares: number;
    pubkey_x: string;
    pubkey_y: string;
  };
  shares: EncryptedShareRow[];
  submissions: { wallet_address: string; submitted_at: string }[];
};

type Stage =
  | "idle"
  | "signing-challenge"
  | "decrypting"
  | "signing-submission"
  | "submitting"
  | "done"
  | "error";

export default function TallyPage() {
  const params = useParams<{ pollId: string }>();
  const pollId = params?.pollId;
  const account = useActiveAccount();
  const [data, setData] = useState<StateData | null>(null);
  const [manifest, setManifest] = useState<SessionManifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [flyStage, setFlyStage] = useState<CurrentStage>(null);

  const { data: isAttester } = useReadContract({
    contract: attesterNFTContract,
    method: "function hasAttesterNFT(address account) view returns (bool)",
    params: [account?.address ?? "0x0000000000000000000000000000000000000000"],
    queryOptions: { enabled: !!account },
  });

  const fetchSession = useCallback(async () => {
    if (!pollId) return;
    setError(null);
    try {
      // Direct lookup by pollId. The previous version scraped the audit
      // log for a session_opened entry, but a session_trigger_requested
      // row (whose target_id is the pollId, not a UUID) consistently came
      // back first in the recent-events feed and produced an invalid
      // UUID lookup downstream. Querying coordinator_sessions by poll_id
      // is the contract this page actually needs.
      const res = await fetch(
        `/api/coordinator/sessions/by-poll/${encodeURIComponent(pollId)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 404) {
          setError(
            "Für diesen Poll ist noch keine Session offen. Öffne sie zuerst auf der Coordinator-Übersicht (→ Tally-Sessions)."
          );
          return;
        }
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      const sd = json as StateData;
      setData(sd);

      try {
        const allowlist = sd.shares.map((s) => s.walletAddress.toLowerCase());
        const m = verifySessionManifestFull(sd.session, allowlist);
        setManifest(m);
        setManifestError(null);
      } catch (e) {
        setManifestError(e instanceof Error ? e.message : String(e));
        setManifest(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [pollId]);

  // Poll Fly's /status for the reconstructor's pipeline stage. Drives the
  // live stepper once shares hit the threshold. Best-effort: a failed
  // fetch keeps the previous value.
  const fetchFlyStage = useCallback(async () => {
    try {
      const res = await fetch("/api/coordinator/status", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setFlyStage((json?.currentStage as CurrentStage) ?? null);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSession();
    fetchFlyStage();
    const id = setInterval(() => {
      fetchSession();
      fetchFlyStage();
    }, 10_000);
    return () => clearInterval(id);
  }, [fetchSession, fetchFlyStage]);

  const myShare: EncryptedShareRow | undefined = useMemo(() => {
    if (!account || !data) return undefined;
    return data.shares.find(
      (s) => s.walletAddress.toLowerCase() === account.address.toLowerCase()
    );
  }, [account, data]);

  const alreadySubmitted = useMemo(() => {
    if (!account || !data) return false;
    return data.submissions.some(
      (s) => s.wallet_address.toLowerCase() === account.address.toLowerCase()
    );
  }, [account, data]);

  const handleSubmit = useCallback(async () => {
    if (!account || !manifest || !myShare || !data) return;
    setError(null);
    try {
      setStage("signing-challenge");
      const shareBytes = await decryptShareForCurrentWallet(
        account,
        myShare.encryptedShareBase64
      );

      setStage("signing-submission");
      const submissionSig = await signSubmission(
        account,
        manifest,
        myShare.shareIndex
      );

      setStage("submitting");
      const result = await submitShareToReconstructor({
        manifest,
        shareIndex: myShare.shareIndex,
        shareBytes,
        walletAddress: account.address,
        submissionSignature: submissionSig,
      });
      console.log("[tally] submission accepted:", result);
      setStage("done");
      // refresh state so the progress counter updates
      fetchSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("error");
    }
  }, [account, manifest, myShare, data, fetchSession]);

  if (!account) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Wallet verbinden</CardTitle>
            <CardDescription>
              Verbinde deine Bescheiniger-Wallet, um deinen Shamir-Anteil zur
              Tally-Session beizutragen.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-foreground">
          MACI Tally Session
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Poll <code className="font-mono">{pollId}</code>. Dein Browser
          entschlüsselt deinen Anteil lokal und sendet ihn an den Coordinator.
          Der entschlüsselte Anteil verlässt deinen Browser nur als HTTPS-Payload
          an den Coordinator-Server.
        </p>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 text-sm text-red-800">{error}</CardContent>
        </Card>
      )}

      {manifestError && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">
              ⚠️ Session-Manifest ungültig
            </CardTitle>
            <CardDescription className="text-red-800">
              Die Signatur des Reconstructor-Manifests konnte nicht zum
              Coordinator zurückverfolgt werden. Sende deinen Anteil NICHT —
              wende dich an den Founder.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs font-mono text-red-900">
            {manifestError}
          </CardContent>
        </Card>
      )}

      {data && data.session.state === "completed" && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge className="bg-green-600 text-white hover:bg-green-700">
                ✓ Abgeschlossen
              </Badge>
              <CardTitle className="text-green-900">
                Auszählung erfolgreich
              </CardTitle>
            </div>
            <CardDescription className="text-green-800">
              Der Coordinator-Schlüssel wurde aus {data.generation.threshold}{" "}
              Anteilen rekonstruiert, die ZK-Beweise wurden on-chain
              verifiziert und das Ergebnis steht im Tally-Vertrag. Der
              Schlüssel wurde aus dem RAM gelöscht — er existiert nicht mehr.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.session.completed_at && (
              <div className="text-xs text-green-900">
                Abgeschlossen:{" "}
                {new Date(data.session.completed_at).toLocaleString("de-DE")}
              </div>
            )}
            <Link
              href="/admin/dashboard/coordinator/proposals"
              className="inline-block text-sm text-green-900 underline hover:text-green-950"
            >
              → Ergebnis im Vorschlags-Dashboard ansehen
            </Link>
          </CardContent>
        </Card>
      )}

      {data && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Auszählungs-Pipeline</CardTitle>
              <Badge variant="outline">
                {data.session.submitted_shares_count}/{data.generation.threshold}
              </Badge>
            </div>
            <CardDescription>
              Session-ID: <code className="text-xs font-mono">{data.session.id}</code>
              {" · "}Ablauf:{" "}
              {new Date(data.session.expires_at).toLocaleString("de-DE")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TallyPipeline
              session={data.session}
              threshold={data.generation.threshold}
              currentStage={flyStage}
            />

            <div className="border-t border-border pt-3 text-xs">
              <div className="text-muted-foreground mb-1">
                Eingegangene Anteile:
              </div>
              <ul className="space-y-0.5 font-mono">
                {data.submissions.map((s) => (
                  <li key={s.wallet_address}>
                    ✓ {s.wallet_address}{" "}
                    <span className="text-muted-foreground">
                      ({new Date(s.submitted_at).toLocaleTimeString("de-DE")})
                    </span>
                  </li>
                ))}
                {data.submissions.length === 0 && (
                  <li className="text-muted-foreground">Noch keine.</li>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {!isAttester ? (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-4 text-sm text-yellow-900">
            Diese Wallet ist kein Bescheiniger. Nur die 5 Bescheiniger können
            Anteile beitragen.
          </CardContent>
        </Card>
      ) : !myShare ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Für diese Wallet existiert kein Anteil in der aktiven Generation —
            entweder bist du nicht Teil dieser Rotation oder die Registrierung
            wurde nach der Key-Generation hinzugefügt.
          </CardContent>
        </Card>
      ) : alreadySubmitted ? (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4 text-sm text-green-900">
            ✓ Du hast deinen Anteil bereits eingereicht.
          </CardContent>
        </Card>
      ) : data?.session.state === "completed" ? null : data?.session.state !==
        "open" ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Session ist nicht mehr offen (Status: {data?.session.state}).
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Anteil einreichen</CardTitle>
            <CardDescription>
              Klick auf <strong>Anteil einreichen</strong>. Deine Wallet
              signiert zweimal: einmal für die Schlüssel-Ableitung, einmal für
              den Submission-Nachweis. Beide werden automatisch angefordert.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!manifest || stage === "submitting" || stage === "decrypting"}
            >
              {stage === "signing-challenge"
                ? "Signiere Challenge…"
                : stage === "decrypting"
                ? "Entschlüssele Anteil…"
                : stage === "signing-submission"
                ? "Signiere Submission…"
                : stage === "submitting"
                ? "Sende an Coordinator…"
                : stage === "done"
                ? "✓ Eingereicht"
                : "Anteil einreichen"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Sicherheitshinweis: Sende deinen Anteil nur, wenn das
              Session-Manifest oben grün ist (keine Warnung). Andernfalls ist
              die Session-Identität nicht verifiziert.
            </p>
          </CardContent>
        </Card>
      )}

      <Link
        href="/admin/dashboard/coordinator"
        className="text-sm text-muted-foreground hover:text-foreground underline inline-block"
      >
        ← Zurück zur Coordinator-Übersicht
      </Link>
    </div>
  );
}
