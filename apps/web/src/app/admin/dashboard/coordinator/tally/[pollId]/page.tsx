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
      // We look up the most-recent open session for this poll. The state
      // endpoint already aggregates open sessions; for now we hit the
      // dedicated session route once we have an id. Use the sessions API
      // root that we know exists from /api/coordinator/state instead.
      const stateRes = await fetch("/api/coordinator/state", { cache: "no-store" });
      const stateJson = await stateRes.json();
      const audit: { event_type: string; target_id: string }[] = stateJson.recentAuditLog ?? [];
      const openSessionId = audit.find(
        (r) =>
          r.event_type === "session_opened" || r.event_type === "session_trigger_requested"
      )?.target_id;
      if (!openSessionId) {
        setError("No open session found for this poll. Trigger one from the status page.");
        return;
      }

      const res = await fetch(`/api/coordinator/sessions/${openSessionId}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const sd = json as StateData;
      if (sd.session.poll_id !== pollId) {
        setError(
          `Active session ${sd.session.id} is for poll ${sd.session.poll_id}, not ${pollId}.`
        );
        return;
      }
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

  useEffect(() => {
    fetchSession();
    const id = setInterval(fetchSession, 15_000);
    return () => clearInterval(id);
  }, [fetchSession]);

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

      {data && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Session-Fortschritt</CardTitle>
              <Badge variant="outline">
                {data.session.submitted_shares_count}/{data.generation.threshold}
              </Badge>
            </div>
            <CardDescription>
              Session-ID: <code className="text-xs font-mono">{data.session.id}</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div>
              <span className="text-muted-foreground">Status: </span>
              <span className="font-mono">{data.session.state}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Ablauf: </span>
              <span className="font-mono">
                {new Date(data.session.expires_at).toLocaleString("de-DE")}
              </span>
            </div>
            <div className="border-t border-border pt-2 mt-2">
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
      ) : data?.session.state !== "open" ? (
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
