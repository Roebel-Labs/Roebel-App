"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import {
  useActiveAccount,
  useSendTransaction,
  ConnectButton,
} from "thirdweb/react";
import { prepareContractCall, waitForReceipt } from "thirdweb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { client } from "@/app/client";
import { activeChain } from "@/lib/chains";
import { wallets } from "@/lib/wallet-config";
import { MACI_INFRA, maciGovernorContract } from "@/lib/maci-config";
import {
  base64ToBytes,
  bytesToBase64,
  sealShareForRecipient,
} from "@/lib/shamir/wallet-encryption";
import {
  generateBabyjubjubKeypair,
  serializePubKeyToHex,
  shortPrivKeyFingerprint,
  type CoordinatorKeypair,
} from "@/lib/shamir/maci-keypair";
import { macipkToBytes, splitSecret } from "@/lib/shamir/sss";
import {
  buildCanonicalKeyGenerationPayload,
  buildKeyGenerationSignaturePayload,
  buildProposalAttachSignaturePayload,
} from "@/lib/shamir/canonical-payload";
import { buildRotationProposalCalldata } from "@/lib/shamir/coordinator-proposal";
import { uploadToIrys } from "@/lib/irys";

const FOUNDER_ALLOWLIST = new Set(
  ["0xc49de63ccfee46c6c5c3e393293f66779799fb28"].map((a) => a.toLowerCase())
);

const THRESHOLD = 3;
const TOTAL_SHARES = 5;

type Registration = {
  walletAddress: string;
  curve25519PubkeyBase64: string;
  registeredAt: string;
};

type Stage =
  | "idle"
  | "generating"
  | "splitting"
  | "persisting"
  | "submittingProposal"
  | "waitingReceipt"
  | "attachingProposal"
  | "done"
  | "error";

export default function GenerateKeyPage() {
  const account = useActiveAccount();
  const router = useRouter();
  const { mutate: sendTransaction, isPending: txPending } = useSendTransaction();

  const [registrations, setRegistrations] = useState<Registration[] | null>(null);
  const [regsLoading, setRegsLoading] = useState(true);
  const [keypair, setKeypair] = useState<CoordinatorKeypair | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [proposeTxHash, setProposeTxHash] = useState<string | null>(null);

  const isFounder = useMemo(
    () => (account ? FOUNDER_ALLOWLIST.has(account.address.toLowerCase()) : false),
    [account]
  );

  const fetchRegs = useCallback(async () => {
    setRegsLoading(true);
    try {
      const res = await fetch("/api/coordinator/share-keys", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setRegistrations(json.registrations as Registration[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRegs();
  }, [fetchRegs]);

  const allRegistered =
    registrations !== null && registrations.length >= TOTAL_SHARES;

  const handleGenerate = useCallback(() => {
    setError(null);
    setKeypair(generateBabyjubjubKeypair());
    setStage("generating");
  }, []);

  const handleSplitAndPersist = useCallback(async () => {
    if (!keypair || !account || !registrations) return;
    setError(null);
    setStage("splitting");
    try {
      const secretBytes = macipkToBytes(keypair.privKeySerialized);
      const shares = await splitSecret(secretBytes, {
        threshold: THRESHOLD,
        total: TOTAL_SHARES,
      });

      // We have 5 shareholders; pair each share with a registered wallet
      // in deterministic lexicographic order so this is reproducible.
      const sortedRegs = [...registrations]
        .map((r) => ({ ...r, walletAddress: r.walletAddress.toLowerCase() }))
        .sort((a, b) => a.walletAddress.localeCompare(b.walletAddress));

      const sealed = sortedRegs.map((reg, i) => {
        const recipientPub = base64ToBytes(reg.curve25519PubkeyBase64);
        const ciphertext = sealShareForRecipient(shares[i].bytes, recipientPub);
        return {
          walletAddress: reg.walletAddress,
          shareIndex: shares[i].shareIndex,
          encryptedShareBase64: bytesToBase64(ciphertext),
        };
      });

      const { xHex, yHex } = serializePubKeyToHex(keypair.pubKey);
      const generationInput = {
        governorAddress: MACI_INFRA.governor,
        pubkeyX: keypair.pubKey.x.toString(),
        pubkeyY: keypair.pubKey.y.toString(),
        threshold: THRESHOLD,
        totalShares: TOTAL_SHARES,
        shareWallets: sortedRegs.map((r) => r.walletAddress),
      };
      const canonical = buildCanonicalKeyGenerationPayload(generationInput);
      // Hash client-side and have the wallet sign the same domain-separated payload.
      const hashHex = await sha256Hex(canonical);
      const signedMessage = buildKeyGenerationSignaturePayload(canonical, hashHex);
      const signature = await account.signMessage({ message: signedMessage });

      setStage("persisting");
      const res = await fetch("/api/coordinator/key-generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorWallet: account.address,
          signature,
          generation: {
            governorAddress: MACI_INFRA.governor,
            pubkeyX: keypair.pubKey.x.toString(),
            pubkeyY: keypair.pubKey.y.toString(),
            threshold: THRESHOLD,
            totalShares: TOTAL_SHARES,
          },
          shares: sealed,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setGenerationId(json.generationId);
      setStage("idle");
      console.log("[generate-key] generation id:", json.generationId);
      console.log("[generate-key] pubkey hex:", { xHex, yHex });
    } catch (err) {
      console.error("[generate-key] split/persist failed", err);
      setError(err instanceof Error ? err.message : String(err));
      setStage("error");
    }
  }, [account, keypair, registrations]);

  const handleSubmitProposal = useCallback(async () => {
    if (!keypair || !account || !generationId) return;
    setError(null);
    setStage("submittingProposal");
    try {
      const calldata = buildRotationProposalCalldata({
        generationId,
        pubKey: keypair.pubKey,
        threshold: THRESHOLD,
        totalShares: TOTAL_SHARES,
        governorAddress: MACI_INFRA.governor,
      });

      const tx = prepareContractCall({
        contract: maciGovernorContract,
        method:
          "function propose(address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) public returns (uint256)",
        params: [calldata.targets, calldata.values, calldata.calldatas, calldata.description],
      });

      sendTransaction(tx, {
        onSuccess: async (result) => {
          setProposeTxHash(result.transactionHash);
          setStage("waitingReceipt");
          try {
            const receipt = await waitForReceipt({
              client,
              chain: maciGovernorContract.chain,
              transactionHash: result.transactionHash,
            });
            const pId = extractProposalIdFromReceipt(receipt);
            if (!pId) throw new Error("ProposalCreated event not found");
            setProposalId(pId);

            // PATCH the generation row so the status page can link to it.
            setStage("attachingProposal");
            const attachMsg = buildProposalAttachSignaturePayload(
              generationId,
              pId,
              result.transactionHash
            );
            const attachSig = await account.signMessage({ message: attachMsg });
            const patchRes = await fetch(
              `/api/coordinator/key-generations/${generationId}/proposal`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  creatorWallet: account.address,
                  signature: attachSig,
                  proposalId: pId,
                  setPubkeyTxHash: result.transactionHash,
                }),
              }
            );
            const patchJson = await patchRes.json();
            if (!patchRes.ok)
              throw new Error(patchJson?.error ?? `HTTP ${patchRes.status}`);

            // Mirror the rotation to the standard `proposals` table so the
            // existing /app/proposals/[id] UI can render it as a regular
            // governance proposal (where Citizens will cast their votes).
            // Best-effort: failure here doesn't roll back — the on-chain
            // proposal already exists.
            try {
              const description = calldata.description;
              const title = "MACI Coordinator Key Rotation";
              const irysReceipt = await uploadToIrys(account, description, [
                { name: "Content-Type", value: "text/markdown" },
                { name: "App", value: "Roebel DAO" },
                { name: "Type", value: "Proposal" },
                { name: "Title", value: title },
                { name: "Kind", value: "coordinator-rotation" },
              ]);
              await fetch("/api/proposals/store", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  proposalId: result.transactionHash,
                  blockchainProposalId: pId,
                  title,
                  markdown: description,
                  irysContentId: irysReceipt.id,
                  irysUrl: irysReceipt.url,
                  transactionHash: result.transactionHash,
                  proposerAddress: account.address,
                  blockNumber: Number(receipt.blockNumber),
                  snapshotBlock: 0,
                  deadlineBlock: 0,
                  category: "governance",
                }),
              });
            } catch (storeErr) {
              console.warn(
                "[generate-key] /api/proposals/store mirror failed — on-chain proposal still exists, may need manual backfill",
                storeErr
              );
            }

            // Wipe the privkey from memory now that the proposal is live.
            setKeypair(null);
            setStage("done");
          } catch (err) {
            console.error("[generate-key] post-tx hook failed", err);
            setError(err instanceof Error ? err.message : String(err));
            setStage("error");
          }
        },
        onError: (txErr) => {
          console.error("[generate-key] propose tx failed", txErr);
          setError(txErr instanceof Error ? txErr.message : String(txErr));
          setStage("error");
        },
      });
    } catch (err) {
      console.error("[generate-key] proposal build failed", err);
      setError(err instanceof Error ? err.message : String(err));
      setStage("error");
    }
  }, [account, generationId, keypair, sendTransaction]);

  const handleViewProposal = useCallback(() => {
    // The `proposals` table mirror uses the tx hash as `proposal_id` (the
    // column /app/proposals/[id] queries against), matching the user-facing
    // CreateProposalForm convention. Navigate to the tx hash URL.
    if (!proposeTxHash) return;
    router.push(`/app/proposals/${proposeTxHash}`);
  }, [proposeTxHash, router]);

  if (!account) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Wallet verbinden</CardTitle>
            <CardDescription>
              Diese Seite ist nur für den Founder. Verbinde die Founder-Wallet,
              um fortzufahren.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectButton
              client={client}
              chain={activeChain}
              wallets={wallets}
              connectModal={{ title: "Founder Wallet", size: "compact" }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isFounder) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Nicht autorisiert</CardTitle>
            <CardDescription className="text-red-800">
              Wallet <code className="text-xs">{account.address}</code> ist nicht
              auf der Founder-Allowlist. Nur der Founder darf die Key-Generation
              ausführen.
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
          MACI Coordinator Key — Generieren & Rotation vorschlagen
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generiert ein frisches Babyjubjub-Keypair, teilt es 3-von-5 unter die
          5 Bescheiniger auf, verschlüsselt jeden Anteil zu deren Curve25519-
          Pubkey, persistiert die verschlüsselten Anteile in Supabase und reicht
          einen <strong>setCoordinatorPubKey()</strong>-Proposal beim MACI
          Governor ein. Der private Schlüssel verlässt deinen Browser nie.
        </p>
      </div>

      {/* Step 1: Registration sanity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>1. Bescheiniger-Registrierungen</CardTitle>
            {allRegistered ? (
              <Badge className="bg-green-600 text-white hover:bg-green-700">
                ✓ {registrations?.length ?? 0}/{TOTAL_SHARES}
              </Badge>
            ) : (
              <Badge variant="outline">
                {regsLoading
                  ? "…"
                  : `${registrations?.length ?? 0}/${TOTAL_SHARES}`}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {regsLoading ? (
            <div className="text-sm text-muted-foreground">Lade…</div>
          ) : !allRegistered ? (
            <div className="text-sm text-red-700">
              Nicht alle Bescheiniger haben sich registriert. Pinge die fehlenden
              Wallets — sie öffnen{" "}
              <code>/admin/dashboard/coordinator/register-share-key</code> und
              klicken einmal auf <strong>Registrieren</strong>.
            </div>
          ) : (
            <ul className="text-xs font-mono space-y-1">
              {registrations!.map((r) => (
                <li key={r.walletAddress} className="text-muted-foreground">
                  ✓ {r.walletAddress}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Generate keypair */}
      <Card>
        <CardHeader>
          <CardTitle>2. Keypair generieren (im Browser)</CardTitle>
          <CardDescription>
            Frischer Schlüssel. Wenn du diesen Tab vor Step 4 schließt, ist der
            Schlüssel weg und du musst von vorne beginnen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!keypair ? (
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!allRegistered}
            >
              Generieren
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="text-xs bg-muted border border-border rounded p-3">
                <div>
                  <span className="text-muted-foreground">pubX: </span>
                  <span className="font-mono break-all">
                    {keypair.pubKey.x.toString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">pubY: </span>
                  <span className="font-mono break-all">
                    {keypair.pubKey.y.toString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">privkey fingerprint: </span>
                  <span className="font-mono">
                    {shortPrivKeyFingerprint(keypair.privKeySerialized)}
                  </span>
                </div>
              </div>
              {!generationId && (
                <Button
                  type="button"
                  onClick={handleSplitAndPersist}
                  disabled={stage === "splitting" || stage === "persisting"}
                >
                  {stage === "splitting"
                    ? "Teile + verschlüssele…"
                    : stage === "persisting"
                    ? "Persistiere…"
                    : "3. Teilen + Verschlüsseln + Persistieren"}
                </Button>
              )}
              {generationId && (
                <div className="text-xs text-green-700 font-mono">
                  ✓ Generation-ID: {generationId}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 4: Submit proposal */}
      <Card>
        <CardHeader>
          <CardTitle>4. Governor-Proposal einreichen</CardTitle>
          <CardDescription>
            Sendet eine <code>setCoordinatorPubKey()</code>-Proposal an{" "}
            <code className="text-xs">{MACI_INFRA.governor}</code>. Du musst
            eine Transaktion signieren.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            onClick={handleSubmitProposal}
            disabled={
              !generationId ||
              txPending ||
              stage === "submittingProposal" ||
              stage === "waitingReceipt" ||
              stage === "attachingProposal" ||
              stage === "done"
            }
          >
            {stage === "submittingProposal"
              ? "Sende Transaktion…"
              : stage === "waitingReceipt"
              ? "Warte auf Bestätigung…"
              : stage === "attachingProposal"
              ? "Verknüpfe Proposal…"
              : stage === "done"
              ? "Eingereicht ✓"
              : "Proposal einreichen"}
          </Button>

          {proposeTxHash && (
            <div className="text-xs">
              <span className="text-muted-foreground">Tx: </span>
              <a
                href={`https://basescan.org/tx/${proposeTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono underline break-all"
              >
                {proposeTxHash}
              </a>
            </div>
          )}

          {proposalId && (
            <div className="space-y-2">
              <div className="text-xs">
                <span className="text-muted-foreground">Proposal ID: </span>
                <span className="font-mono break-all">{proposalId}</span>
              </div>
              <Button type="button" onClick={handleViewProposal} variant="outline">
                Zum Proposal →
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <div className="text-sm text-red-800">
              <strong>Fehler:</strong> {error}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** SHA-256 → hex, browser/Node universal via SubtleCrypto. */
async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const PROPOSAL_CREATED_IFACE = new ethers.Interface([
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
]);

function extractProposalIdFromReceipt(receipt: {
  logs: { address: string; data: string; topics: string[] }[];
}): string | null {
  const governorAddr = MACI_INFRA.governor.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== governorAddr) continue;
    try {
      const parsed = PROPOSAL_CREATED_IFACE.parseLog({
        topics: log.topics,
        data: log.data,
      });
      if (parsed?.name === "ProposalCreated") {
        return parsed.args.proposalId.toString();
      }
    } catch {
      // not the event we want
    }
  }
  return null;
}
