"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import {
  parseEventLogs,
  prepareContractCall,
  prepareEvent,
  readContract,
  waitForReceipt,
} from "thirdweb";

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
type Stage =
  | "idle"
  | "encrypting"
  | "uploading"
  | "signing"
  | "mining"
  | "indexing";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const RECEIPT_TIMEOUT_MS = 90_000;

const STAGE_LABEL: Record<Stage, string> = {
  idle: "Entziehung beantragen",
  encrypting: "Daten verschlüsseln …",
  uploading: "Auf Irys hochladen …",
  signing: "Bitte in Wallet bestätigen …",
  mining: "On-Chain bestätigen …",
  indexing: "Antrag indexieren …",
};

const STAGE_PROGRESS: Record<Stage, number> = {
  idle: 0,
  encrypting: 15,
  uploading: 40,
  signing: 60,
  mining: 85,
  indexing: 95,
};

const REVOCATION_EVENT = prepareEvent({
  signature:
    "event RevocationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)",
});

export default function RevokeMembershipPage() {
  const account = useActiveAccount();
  const { isAttester, isCitizen, isLoading: statusLoading } =
    useVerificationStatus();

  const [step, setStep] = useState<Step>("form");
  const [mode, setMode] = useState<Mode>("target");
  const [contractType, setContractType] = useState<ContractType>("attester");
  const [targetAddress, setTargetAddress] = useState("");
  const [reason, setReason] = useState("");

  const [targetCheck, setTargetCheck] = useState<{
    state: "idle" | "checking" | "ok" | "missing" | "error";
    message?: string;
  }>({ state: "idle" });

  const [stage, setStage] = useState<Stage>("idle");
  const [requestId, setRequestId] = useState<string>("");
  const [timedOut, setTimedOut] = useState(false);

  const { mutate: sendTransaction } = useSendTransaction();

  const target = mode === "self" ? account?.address ?? "" : targetAddress.trim();
  const addressFormatValid = useMemo(
    () => ADDRESS_REGEX.test(target),
    [target]
  );
  const reasonValid = reason.trim().length >= 5;

  const canSubmitMode = useMemo(() => {
    if (!account) return false;
    return contractType === "attester" ? isAttester : isCitizen;
  }, [account, contractType, isAttester, isCitizen]);

  const requiredLabel =
    contractType === "attester"
      ? "2 Bescheiniger-Unterschriften"
      : "1 Bescheiniger-Unterschrift";

  useEffect(() => {
    if (mode === "self") {
      setTargetCheck({ state: "idle" });
      return;
    }
    if (!addressFormatValid) {
      setTargetCheck({ state: "idle" });
      return;
    }
    let cancelled = false;
    setTargetCheck({ state: "checking" });

    const run = async () => {
      try {
        const has = await readContract({
          contract:
            contractType === "attester"
              ? attesterNFTContract
              : citizenNFTContract,
          method:
            contractType === "attester"
              ? "function hasAttesterNFT(address account) view returns (bool)"
              : "function hasCitizenNFT(address account) view returns (bool)",
          params: [target],
        });
        if (cancelled) return;
        if (has) {
          setTargetCheck({ state: "ok" });
        } else {
          setTargetCheck({
            state: "missing",
            message:
              contractType === "attester"
                ? "Diese Adresse hält kein Bescheiniger-NFT."
                : "Diese Adresse hält kein Bürger-NFT.",
          });
        }
      } catch (err) {
        if (cancelled) return;
        setTargetCheck({
          state: "error",
          message: "Adresse konnte nicht geprüft werden.",
        });
        console.error("hasNFT pre-flight failed:", err);
      }
    };

    const t = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mode, contractType, target, addressFormatValid]);

  const targetReady =
    mode === "self" ? addressFormatValid : targetCheck.state === "ok";

  const canAdvance =
    !!account && canSubmitMode && targetReady && reasonValid;

  const isBusy = stage !== "idle";
  const canSubmit = canAdvance && !isBusy;

  const handleUploadAndSubmit = async () => {
    if (!canSubmit || !account) return;

    setTimedOut(false);
    setStage("encrypting");
    try {
      const { key: encryptionKey, timestamp: encryptionTimestamp } =
        await deriveEncryptionKey(account);

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

      setStage("uploading");
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

      const contract =
        contractType === "attester" ? attesterNFTContract : citizenNFTContract;
      const transaction = prepareContractCall({
        contract,
        method:
          "function createRevocationRequest(address target, string evidenceURI)",
        params: [target, irysReceipt.url],
      });

      setStage("signing");
      sendTransaction(transaction, {
        onSuccess: async (result) => {
          setStage("mining");
          try {
            const receiptPromise = waitForReceipt({
              client,
              chain: contract.chain,
              transactionHash: result.transactionHash,
            });
            const receipt = await Promise.race([
              receiptPromise,
              new Promise<"timeout">((resolve) =>
                setTimeout(() => resolve("timeout"), RECEIPT_TIMEOUT_MS)
              ),
            ]);

            if (receipt === "timeout") {
              setTimedOut(true);
              setRequestId("pending");
              setStep("success");
              setStage("idle");
              toast.message("Transaktion läuft noch", {
                description:
                  "Die Antrags-ID erscheint, sobald sie bestätigt ist.",
              });
              return;
            }

            const decoded = parseEventLogs({
              logs: receipt.logs,
              events: [REVOCATION_EVENT],
            });
            const requestIdBig = decoded[0]?.args?.requestId;
            const parsedRequestId =
              requestIdBig != null ? requestIdBig.toString() : "pending";
            setRequestId(parsedRequestId);

            if (parsedRequestId !== "pending") {
              setStage("indexing");
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
              }
            }
            setStep("success");
            setStage("idle");
          } catch (err) {
            console.error("Failed to read receipt:", err);
            setRequestId("pending");
            setStep("success");
            setStage("idle");
          }
        },
        onError: (err) => {
          console.error("Revocation tx failed:", err);
          setStage("idle");
          toast.error("Transaktion fehlgeschlagen", {
            description:
              err instanceof Error ? err.message : "Unbekannter Fehler",
          });
        },
      });
    } catch (err) {
      console.error("Revocation flow failed:", err);
      setStage("idle");
      toast.error("Antrag fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  };

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl =
    requestId && requestId !== "pending"
      ? `${origin}/app/verifizierung/nachweis/${requestId}?contract=${contractType}`
      : "";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <Link
            href="/app/verifizierung"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Zurück zur Verifizierung
          </Link>
        </div>

        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-medium text-foreground">
            Mitgliedschaft entziehen
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Beantrage die Entziehung deines eigenen Bescheiniger- oder
            Bürger-Status oder eines anderen Mitglieds.
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm p-4 sm:p-8">
          {statusLoading ? (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-foreground border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-muted-foreground">
                Mitgliedschaftsstatus wird geprüft …
              </p>
            </div>
          ) : !isAttester && !isCitizen ? (
            <InfoBox tone="danger" title="Keine Mitgliedschaft gefunden">
              Mit dieser Wallet hältst du weder einen Bescheiniger- noch einen
              Bürger-Pass. Eine Entziehung kann nur von aktiven Mitgliedern
              beantragt werden.
            </InfoBox>
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
              addressFormatValid={addressFormatValid}
              reasonValid={reasonValid}
              canSubmitMode={canSubmitMode}
              isAttester={isAttester}
              isCitizen={isCitizen}
              requiredLabel={requiredLabel}
              targetCheck={targetCheck}
              canNext={canAdvance}
              onNext={() => setStep("confirm")}
            />
          ) : step === "confirm" ? (
            <ConfirmStep
              mode={mode}
              contractType={contractType}
              target={target}
              reason={reason}
              requiredLabel={requiredLabel}
              stage={stage}
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
              timedOut={timedOut}
            />
          )}
        </div>
      </div>
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
  addressFormatValid,
  reasonValid,
  canSubmitMode,
  isAttester,
  isCitizen,
  requiredLabel,
  targetCheck,
  canNext,
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
  addressFormatValid: boolean;
  reasonValid: boolean;
  canSubmitMode: boolean;
  isAttester: boolean;
  isCitizen: boolean;
  requiredLabel: string;
  targetCheck: {
    state: "idle" | "checking" | "ok" | "missing" | "error";
    message?: string;
  };
  canNext: boolean;
  onNext: () => void;
}) {
  const showContractToggle = isAttester && isCitizen;

  return (
    <div className="space-y-5 sm:space-y-6">
      <InfoBox tone="danger">
        ⚠️ Eine bestätigte Entziehung verbrennt das NFT dauerhaft und entzieht
        die Stimmrechte. Verwende dies nur in begründeten Fällen.
      </InfoBox>

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
        <InfoBox tone="warning" small>
          Mit dieser Wallet hältst du keinen{" "}
          {contractType === "attester" ? "Bescheiniger" : "Bürger"}-Pass und
          kannst{" "}
          {mode === "self"
            ? "deine eigene Rolle nicht entziehen lassen"
            : "keinen Entziehungsantrag für diesen Vertrag stellen"}
          .
        </InfoBox>
      )}

      {mode === "self" && (
        <InfoBox tone="warning" small>
          Du kannst deinen eigenen Antrag nicht selbst bestätigen. Der Antrag
          benötigt {requiredLabel} von anderen Bescheinigern.
        </InfoBox>
      )}

      {mode === "target" && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Zieladresse *
          </label>
          <input
            type="text"
            inputMode="text"
            value={targetAddress}
            onChange={(e) => setTargetAddress(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="w-full px-4 py-3 min-h-12 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-foreground focus:border-transparent font-mono text-base"
            required
          />
          {targetAddress.length > 0 && !addressFormatValid && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              Bitte eine gültige 0x-Adresse mit 40 Hex-Zeichen einfügen.
            </p>
          )}
          {addressFormatValid && targetCheck.state === "checking" && (
            <p className="text-xs text-muted-foreground mt-1">
              Adresse wird geprüft …
            </p>
          )}
          {addressFormatValid && targetCheck.state === "missing" && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {targetCheck.message}
            </p>
          )}
          {addressFormatValid && targetCheck.state === "error" && (
            <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
              {targetCheck.message}
            </p>
          )}
          {addressFormatValid && targetCheck.state === "ok" && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
              ✓ Adresse hält ein gültiges{" "}
              {contractType === "attester" ? "Bescheiniger" : "Bürger"}-NFT.
            </p>
          )}
        </div>
      )}

      {mode === "self" && (
        <div className="bg-muted border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-1">
            Zieladresse (deine Wallet)
          </div>
          <div className="font-mono text-sm break-all text-foreground">
            {target || "—"}
          </div>
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
          className="w-full px-4 py-3 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-foreground focus:border-transparent text-base"
          required
        />
        <p
          className={`text-xs mt-1 text-right ${
            reasonValid
              ? "text-muted-foreground"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {reason.trim().length}/5
        </p>
      </div>

      <InfoBox tone="info">
        Nach der Einreichung benötigt der Antrag <strong>{requiredLabel}</strong>{" "}
        zur Bestätigung. Du kannst den Link danach an die Unterzeichner teilen.
      </InfoBox>

      <button
        onClick={onNext}
        disabled={!canNext}
        className="w-full bg-foreground hover:bg-foreground/90 text-background px-6 py-3 min-h-12 rounded-lg transition-colors font-medium disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
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
  stage,
  onBack,
  onSubmit,
  canSubmit,
}: {
  mode: Mode;
  contractType: ContractType;
  target: string;
  reason: string;
  requiredLabel: string;
  stage: Stage;
  onBack: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
}) {
  const isBusy = stage !== "idle";
  const progress = STAGE_PROGRESS[stage];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h2 className="text-xl font-medium text-foreground mb-2">
          Bestätigung
        </h2>
        <p className="text-sm text-muted-foreground">
          Prüfe deine Angaben und reiche den Antrag ein.
        </p>
      </div>

      <div className="bg-muted border border-border rounded-lg p-4 sm:p-6 space-y-4">
        <Row
          label="Modus"
          value={
            mode === "self"
              ? "Eigene Rolle entziehen"
              : "Anderes Mitglied entziehen"
          }
        />
        <Row
          label="Vertrag"
          value={contractType === "attester" ? "Bescheiniger-NFT" : "Bürger-NFT"}
        />
        <Row label="Zieladresse" value={target} mono />
        <div>
          <div className="text-xs text-muted-foreground mb-1">Begründung</div>
          <div className="text-sm text-foreground whitespace-pre-wrap break-words">
            {reason}
          </div>
        </div>
      </div>

      <InfoBox tone="info">
        Nach Einreichung benötigt der Antrag <strong>{requiredLabel}</strong>.
        Du wirst eine Wallet-Signatur zur Verschlüsselung der Begründung und
        eine Signatur zur On-Chain-Transaktion durchführen.
      </InfoBox>

      {isBusy && (
        <div className="space-y-2">
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {STAGE_LABEL[stage]}
          </p>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row gap-3">
        <button
          onClick={onBack}
          disabled={isBusy}
          className="flex-1 bg-card hover:bg-accent border border-border text-foreground px-6 py-3 min-h-12 rounded-lg transition-colors font-medium disabled:opacity-50"
        >
          ← Zurück
        </button>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-3 min-h-12 rounded-lg transition-colors font-medium disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {STAGE_LABEL[stage]}
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
  timedOut,
}: {
  requestId: string;
  shareUrl: string;
  contractType: ContractType;
  requiredLabel: string;
  timedOut: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const [qrSize, setQrSize] = useState(240);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function"
    );
  }, []);

  useEffect(() => {
    const measure = () => {
      const el = qrContainerRef.current;
      if (!el) return;
      const w = el.getBoundingClientRect().width;
      const next = Math.max(160, Math.min(280, Math.floor(w - 32)));
      setQrSize(next);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [shareUrl]);

  void resolvedTheme;

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link kopiert");
    } catch (err) {
      console.error("clipboard failed:", err);
      toast.error("Link konnte nicht kopiert werden");
    }
  };

  const nativeShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.share({
        title: "Entziehungsantrag",
        text: `Antrag #${requestId} — bitte bestätigen`,
        url: shareUrl,
      });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        console.error("native share failed:", err);
      }
    }
  };

  const hasRequestId = !!requestId && requestId !== "pending";

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-xl sm:text-2xl font-medium text-foreground">
          Antrag eingereicht
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Der Entziehungsantrag wurde on-chain registriert. Er benötigt{" "}
          {requiredLabel} zur Bestätigung.
        </p>
      </div>

      {hasRequestId ? (
        <>
          <div className="bg-muted border border-border rounded-lg p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">Antrags-ID</div>
            <div className="font-mono font-medium text-lg text-foreground">
              #{requestId}
            </div>
          </div>

          <div className="bg-muted border border-border rounded-xl p-4 sm:p-6">
            <h3 className="font-medium text-foreground mb-2 text-center">
              Link mit Unterzeichnern teilen
            </h3>
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Zeige den QR-Code oder teile den Link mit einem Bescheiniger,
              damit er die Entziehung bestätigen kann.
            </p>

            <div
              ref={qrContainerRef}
              className="bg-white p-4 rounded-lg flex justify-center mb-4 mx-auto max-w-[320px]"
            >
              <QRCodeSVG
                value={shareUrl}
                size={qrSize}
                level="H"
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {canShare && (
                <button
                  onClick={nativeShare}
                  className="flex-1 bg-foreground hover:bg-foreground/90 text-background px-4 py-3 min-h-12 rounded-lg font-medium transition-colors"
                >
                  Teilen …
                </button>
              )}
              <button
                onClick={copyLink}
                className={`flex-1 px-4 py-3 min-h-12 rounded-lg font-medium transition-colors ${
                  canShare
                    ? "bg-card border border-border text-foreground hover:bg-accent"
                    : "bg-foreground text-background hover:bg-foreground/90"
                }`}
              >
                Link kopieren
              </button>
            </div>

            <div className="text-center mt-3">
              <Link
                href={`/app/verifizierung/nachweis/${requestId}?contract=${contractType}`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Direkt zum Antrag ansehen →
              </Link>
            </div>

            <p className="font-mono text-xs text-muted-foreground mt-4 break-all text-center">
              {shareUrl}
            </p>
          </div>
        </>
      ) : (
        <InfoBox tone="warning">
          {timedOut
            ? "Die Transaktion läuft noch. Lade die Seite später neu, um die Antrags-ID zu sehen."
            : "Der Antrag wurde erstellt. Die Antrags-ID wird gerade ermittelt …"}
        </InfoBox>
      )}

      <Link
        href="/app/verifizierung"
        className="block text-center bg-foreground hover:bg-foreground/90 text-background px-8 py-3 min-h-12 rounded-lg transition-colors font-medium"
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
      className={`px-4 py-3 min-h-12 rounded-lg text-sm font-medium transition-colors border ${
        active
          ? "bg-foreground text-background border-foreground"
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

function InfoBox({
  tone,
  title,
  small,
  children,
}: {
  tone: "info" | "warning" | "danger";
  title?: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  const toneStyles =
    tone === "danger"
      ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-200"
      : tone === "warning"
        ? "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950/40 dark:border-yellow-900/60 dark:text-yellow-200"
        : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900/60 dark:text-blue-200";

  return (
    <div
      className={`border rounded-lg ${
        small ? "p-3" : "p-4"
      } ${toneStyles}`}
    >
      {title && (
        <p className={`font-medium mb-1 ${small ? "text-xs" : "text-sm"}`}>
          {title}
        </p>
      )}
      <p className={small ? "text-xs" : "text-sm"}>{children}</p>
    </div>
  );
}
