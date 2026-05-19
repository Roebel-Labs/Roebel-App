"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { prepareContractCall, waitForReceipt } from "thirdweb";

import { Header } from "@/components/layout/Header";
import { client } from "@/app/client";
import { useVerificationStatus } from "@/hooks/useVerificationStatus";
import {
  attesterNFTContract,
  citizenNFTContract,
} from "@/lib/verification-contracts";
import { uploadToIrys } from "@/lib/irys";
import {
  deriveEncryptionKey,
  encryptEvidence,
  type PersonalData,
  type PublicMetadata,
  type EncryptedEvidence,
} from "@/lib/crypto/encryption";

type Step = "form" | "confirm" | "success";
type Mode = "self" | "target";
type ContractType = "attester" | "citizen";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export default function RevokeMembershipPage() {
  const account = useActiveAccount();
  const { isAttester, isCitizen, isLoading: statusLoading } =
    useVerificationStatus();

  const [step, setStep] = useState<Step>("form");
  const [mode, setMode] = useState<Mode>("target");
  const [contractType, setContractType] = useState<ContractType>("attester");
  const [targetAddress, setTargetAddress] = useState("");
  const [reason, setReason] = useState("");

  const [isUploading, setIsUploading] = useState(false);
  const [irysUrl, setIrysUrl] = useState("");
  const [irysId, setIrysId] = useState("");
  const [encryptedPayload, setEncryptedPayload] =
    useState<EncryptedEvidence | null>(null);
  const [requestId, setRequestId] = useState<string>("");

  const { mutate: sendTransaction, isPending } = useSendTransaction();

  const target = mode === "self" ? account?.address ?? "" : targetAddress.trim();
  const addressValid = useMemo(() => ADDRESS_REGEX.test(target), [target]);
  const reasonValid = reason.trim().length >= 5;

  // Mode restrictions:
  //   - target-revocation only Attesters can initiate (createRevocationRequest
  //     for AttesterNFT requires hasAttesterNFT[msg.sender]; for CitizenNFT it
  //     requires hasCitizenNFT[msg.sender]).
  //   - self-revocation needs you to actually hold the role you're renouncing.
  const canSubmitMode = useMemo(() => {
    if (!account) return false;
    if (mode === "self") {
      return contractType === "attester" ? isAttester : isCitizen;
    }
    // target-revocation
    return contractType === "attester" ? isAttester : isCitizen;
  }, [account, mode, contractType, isAttester, isCitizen]);

  const canSubmit =
    !!account &&
    canSubmitMode &&
    addressValid &&
    reasonValid &&
    !isPending &&
    !isUploading;

  const requiredSignatures = contractType === "attester" ? 2 : 1;
  const requiredLabel =
    contractType === "attester"
      ? "2 Bescheiniger-Unterschriften"
      : "1 Bescheiniger-Unterschrift";

  const handleUploadAndSubmit = async () => {
    if (!canSubmit || !account) return;

    setIsUploading(true);
    try {
      // 1. Derive encryption key from wallet (EIP-712, V1)
      const { key: encryptionKey, timestamp: encryptionTimestamp } =
        await deriveEncryptionKey(account);

      // 2. Build PersonalData with revocation context. The PersonalData shape
      //    is { name, address } — we stuff reason + target into it so we can
      //    reuse the existing encryption + Irys + Supabase pipeline without
      //    schema changes.
      const personalData: PersonalData = {
        name: reason.trim(),
        address: target.toLowerCase(),
      };

      const publicMetadata: PublicMetadata = {
        reason: "Mitgliedschaftsentziehung",
        timestamp: new Date().toISOString(),
        type:
          contractType === "attester"
            ? "attester_attestation"
            : "citizen_attestation",
        requester: account.address,
        encrypted: true,
        encryptionTimestamp,
        encryptionVersion: "eip712-v1",
      };

      const encryptedBlob = encryptEvidence(personalData, encryptionKey);
      const evidence: EncryptedEvidence = {
        encrypted: encryptedBlob,
        metadata: publicMetadata,
      };
      setEncryptedPayload(evidence);

      // 3. Upload to Irys
      const irysReceipt = await uploadToIrys(
        account,
        JSON.stringify(evidence, null, 2),
        [
          { name: "Content-Type", value: "application/json" },
          { name: "App", value: "HomeTown DAO Verification" },
          { name: "Type", value: "Revocation" },
          { name: "Contract", value: contractType },
          { name: "Encrypted", value: "true" },
          { name: "EncryptionVersion", value: "1" },
        ]
      );
      setIrysId(irysReceipt.id);
      setIrysUrl(irysReceipt.url);

      // 4. Submit createRevocationRequest on-chain
      const contract =
        contractType === "attester" ? attesterNFTContract : citizenNFTContract;
      const transaction = prepareContractCall({
        contract,
        method:
          "function createRevocationRequest(address target, string evidenceURI)",
        params: [target, irysReceipt.url],
      });

      sendTransaction(transaction, {
        onSuccess: async (result) => {
          try {
            const receipt = await waitForReceipt({
              client,
              chain: contract.chain,
              transactionHash: result.transactionHash,
            });
            // RevocationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)
            const log = receipt.logs.find(
              (l) =>
                l.address.toLowerCase() === contract.address.toLowerCase() &&
                l.topics.length >= 3
            );
            const requestIdHex = log?.topics?.[1];
            const parsedRequestId = requestIdHex
              ? parseInt(requestIdHex, 16).toString()
              : "pending";
            setRequestId(parsedRequestId);

            // Persist evidence in Supabase mirror
            if (parsedRequestId !== "pending") {
              try {
                await fetch("/api/evidence/store", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    requestId: parsedRequestId,
                    contractType,
                    irysId: irysReceipt.id,
                    irysUrl: irysReceipt.url,
                    evidencePayload: evidence,
                    isEncrypted: true,
                    requester: account.address,
                  }),
                });
              } catch (err) {
                console.error("Supabase evidence store failed:", err);
                // Non-fatal — chain + Irys still have the truth.
              }
            }
            setStep("success");
          } catch (err) {
            console.error("Failed to parse requestId:", err);
            setRequestId("pending");
            setStep("success");
          }
        },
        onError: (err) => {
          console.error("Revocation tx failed:", err);
          alert(
            `Transaktion fehlgeschlagen: ${
              err instanceof Error ? err.message : "Unbekannter Fehler"
            }`
          );
        },
      });
    } catch (err) {
      console.error("Revocation flow failed:", err);
      alert(
        `Antrag fehlgeschlagen: ${
          err instanceof Error ? err.message : "Unbekannter Fehler"
        }`
      );
    } finally {
      setIsUploading(false);
    }
  };

  const shareUrl =
    requestId && requestId !== "pending"
      ? `https://roebel.app/verifizierung/nachweis/${requestId}?contract=${contractType}`
      : "";

  return (
    <div className="min-h-screen bg-muted">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <Link
              href="/verifizierung"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Zurück zur Verifizierung
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-medium text-foreground">
              Mitgliedschaft entziehen
            </h1>
            <p className="text-muted-foreground mt-1">
              Beantrage die Entziehung deines eigenen Bescheiniger- oder
              Bürger-Status oder eines anderen Mitglieds.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl shadow-sm p-8">
            {!account ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  Bitte verbinde deine Wallet, um fortzufahren.
                </p>
              </div>
            ) : statusLoading ? (
              <div className="text-center py-12">
                <div className="inline-block w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-muted-foreground">
                  Mitgliedschaftsstatus wird geprüft …
                </p>
              </div>
            ) : !isAttester && !isCitizen ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800 font-medium mb-1">
                  Keine Mitgliedschaft gefunden
                </p>
                <p className="text-sm text-red-700">
                  Mit dieser Wallet hältst du weder einen Bescheiniger- noch
                  einen Bürger-Pass. Eine Entziehung kann nur von aktiven
                  Mitgliedern beantragt werden.
                </p>
              </div>
            ) : step === "form" ? (
              <FormStep
                mode={mode}
                setMode={setMode}
                contractType={contractType}
                setContractType={setContractType}
                targetAddress={targetAddress}
                setTargetAddress={setTargetAddress}
                reason={reason}
                setReason={setReason}
                target={target}
                addressValid={addressValid}
                reasonValid={reasonValid}
                canSubmitMode={canSubmitMode}
                isAttester={isAttester}
                isCitizen={isCitizen}
                requiredLabel={requiredLabel}
                onNext={() => setStep("confirm")}
              />
            ) : step === "confirm" ? (
              <ConfirmStep
                mode={mode}
                contractType={contractType}
                target={target}
                reason={reason}
                requiredLabel={requiredLabel}
                isSubmitting={isPending || isUploading}
                onBack={() => setStep("form")}
                onSubmit={handleUploadAndSubmit}
                canSubmit={canSubmit}
              />
            ) : (
              <SuccessStep
                requestId={requestId}
                shareUrl={shareUrl}
                contractType={contractType}
                requiredLabel={requiredLabel}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function FormStep({
  mode,
  setMode,
  contractType,
  setContractType,
  targetAddress,
  setTargetAddress,
  reason,
  setReason,
  target,
  addressValid,
  reasonValid,
  canSubmitMode,
  isAttester,
  isCitizen,
  requiredLabel,
  onNext,
}: {
  mode: Mode;
  setMode: (v: Mode) => void;
  contractType: ContractType;
  setContractType: (v: ContractType) => void;
  targetAddress: string;
  setTargetAddress: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  target: string;
  addressValid: boolean;
  reasonValid: boolean;
  canSubmitMode: boolean;
  isAttester: boolean;
  isCitizen: boolean;
  requiredLabel: string;
  onNext: () => void;
}) {
  const showContractToggle = isAttester && isCitizen;
  const canNext = addressValid && reasonValid && canSubmitMode;

  return (
    <div className="space-y-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">
          ⚠️ Eine bestätigte Entziehung verbrennt das NFT dauerhaft und
          entzieht die Stimmrechte. Verwende dies nur in begründeten Fällen.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Was möchtest du tun?
        </label>
        <div className="grid grid-cols-2 gap-2">
          <ToggleButton
            active={mode === "target"}
            onClick={() => setMode("target")}
            label="Anderes Mitglied"
          />
          <ToggleButton
            active={mode === "self"}
            onClick={() => setMode("self")}
            label="Eigene Rolle"
          />
        </div>
      </div>

      {showContractToggle && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Welche Rolle?
          </label>
          <div className="grid grid-cols-2 gap-2">
            <ToggleButton
              active={contractType === "attester"}
              onClick={() => setContractType("attester")}
              label="Bescheiniger"
            />
            <ToggleButton
              active={contractType === "citizen"}
              onClick={() => setContractType("citizen")}
              label="Bürger"
            />
          </div>
        </div>
      )}

      {!canSubmitMode && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800">
            Mit dieser Wallet hältst du keinen{" "}
            {contractType === "attester" ? "Bescheiniger" : "Bürger"}-Pass und
            kannst{" "}
            {mode === "self"
              ? "deine eigene Rolle nicht entziehen lassen"
              : "keinen Entziehungsantrag für diesen Vertrag stellen"}
            .
          </p>
        </div>
      )}

      {mode === "target" && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Zieladresse *
          </label>
          <input
            type="text"
            value={targetAddress}
            onChange={(e) => setTargetAddress(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent font-mono text-sm"
            required
          />
          {targetAddress.length > 0 && !addressValid && (
            <p className="text-xs text-red-600 mt-1">
              Bitte eine gültige 0x-Adresse mit 40 Hex-Zeichen einfügen.
            </p>
          )}
        </div>
      )}

      {mode === "self" && (
        <div className="bg-muted border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">
            Zieladresse (deine Wallet)
          </div>
          <div className="font-mono text-sm break-all">{target || "—"}</div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Begründung *
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Klare Begründung, mindestens 5 Zeichen."
          rows={4}
          className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
          required
        />
        <p
          className={`text-xs mt-1 text-right ${
            reasonValid ? "text-muted-foreground" : "text-red-600"
          }`}
        >
          {reason.trim().length}/5
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Nach der Einreichung benötigt der Antrag <strong>{requiredLabel}</strong>{" "}
          zur Bestätigung. Du kannst den Link danach an die Unterzeichner
          teilen.
        </p>
      </div>

      <button
        onClick={onNext}
        disabled={!canNext}
        className="w-full bg-black hover:bg-foreground/90 text-white px-6 py-3 rounded-lg transition-colors font-medium disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
      >
        Weiter →
      </button>
    </div>
  );
}

function ConfirmStep({
  mode,
  contractType,
  target,
  reason,
  requiredLabel,
  isSubmitting,
  onBack,
  onSubmit,
  canSubmit,
}: {
  mode: Mode;
  contractType: ContractType;
  target: string;
  reason: string;
  requiredLabel: string;
  isSubmitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-medium text-foreground mb-2">
          Bestätigung
        </h2>
        <p className="text-muted-foreground">
          Prüfe deine Angaben und reiche den Antrag ein.
        </p>
      </div>

      <div className="bg-muted border border-border rounded-lg p-6 space-y-4">
        <Row label="Modus" value={mode === "self" ? "Eigene Rolle entziehen" : "Anderes Mitglied entziehen"} />
        <Row label="Vertrag" value={contractType === "attester" ? "Bescheiniger-NFT" : "Bürger-NFT"} />
        <Row
          label="Zieladresse"
          value={target}
          mono
        />
        <div>
          <div className="text-xs text-muted-foreground mb-1">Begründung</div>
          <div className="text-sm">{reason}</div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Nach Einreichung benötigt der Antrag <strong>{requiredLabel}</strong>.
          Du wirst eine Wallet-Signatur zur Verschlüsselung der Begründung und
          eine Signatur zur On-Chain-Transaktion durchführen.
        </p>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="flex-1 bg-card hover:bg-accent border border-border text-foreground px-6 py-3 rounded-lg transition-colors font-medium disabled:opacity-50"
        >
          ← Zurück
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg transition-colors font-medium disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Wird eingereicht …" : "Entziehung beantragen"}
        </button>
      </div>
    </div>
  );
}

function SuccessStep({
  requestId,
  shareUrl,
  contractType,
  requiredLabel,
}: {
  requestId: string;
  shareUrl: string;
  contractType: ContractType;
  requiredLabel: string;
}) {
  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link kopiert!");
    } catch {
      // ignored
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-6xl mb-4">✓</div>
        <h2 className="text-2xl font-medium text-foreground">
          Antrag eingereicht
        </h2>
        <p className="text-muted-foreground">
          Der Entziehungsantrag wurde on-chain registriert. Er benötigt{" "}
          {requiredLabel} zur Bestätigung.
        </p>
      </div>

      {requestId && requestId !== "pending" ? (
        <>
          <div className="bg-muted border border-border rounded-lg p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">Antrags-ID</div>
            <div className="font-mono font-medium text-lg">#{requestId}</div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="font-medium text-blue-900 mb-3 text-center">
              📱 Link mit Unterzeichnern teilen
            </h3>
            <p className="text-sm text-blue-800 mb-4 text-center">
              Zeige den QR-Code oder teile den Link mit einem Bescheiniger,
              damit er die Entziehung bestätigen kann.
            </p>

            <div className="bg-card p-6 rounded-lg flex justify-center mb-4">
              <QRCodeSVG value={shareUrl} size={200} level="H" />
            </div>

            <button
              onClick={copyLink}
              className="w-full bg-foreground hover:bg-foreground/90 text-white px-4 py-3 rounded-lg font-medium transition-colors mb-3"
            >
              Link kopieren
            </button>

            <div className="text-center">
              <Link
                href={`/verifizierung/nachweis/${requestId}?contract=${contractType}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Direkt zum Antrag ansehen →
              </Link>
            </div>

            <p className="font-mono text-xs text-blue-900/70 mt-4 break-all text-center">
              {shareUrl}
            </p>
          </div>
        </>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <p className="text-sm text-yellow-800">
            Der Antrag wurde erstellt. Die Antrags-ID wird gerade ermittelt …
          </p>
        </div>
      )}

      <Link
        href="/verifizierung"
        className="block text-center bg-black hover:bg-foreground/90 text-white px-8 py-3 rounded-lg transition-colors font-medium"
      >
        Zurück zur Verifizierung
      </Link>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors border ${
        active
          ? "bg-foreground text-white border-foreground"
          : "bg-card text-foreground border-border hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div
        className={`${
          mono ? "font-mono text-sm break-all" : "font-medium"
        } text-foreground`}
      >
        {value}
      </div>
    </div>
  );
}
