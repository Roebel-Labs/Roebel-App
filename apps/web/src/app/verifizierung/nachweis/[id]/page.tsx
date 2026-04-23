"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { useActiveAccount, useSendTransaction, useReadContract } from "thirdweb/react";
import { useVerificationStatus } from "@/hooks/useVerificationStatus";
import { prepareContractCall, readContract } from "thirdweb";
import { attesterNFTContract, citizenNFTContract } from "@/lib/verification-contracts";
import { de } from "@/lib/translations/de";
import Link from "next/link";
import { getBlockscoutTxUrl, getBlockscoutContractEventsUrl, getBaseScanTxUrl } from "@/lib/blockscout";
import {
  deriveEncryptionKey,
  decryptDataKey,
  decryptEvidence,
  isEncrypted,
  type PersonalData,
  type EncryptedEvidence as EncryptedEvidenceType,
} from "@/lib/crypto/encryption";

interface EvidenceData {
  name?: string;
  address?: string;
  reason?: string;
  timestamp?: string;
  type?: string;
  requester?: string;
  // New encrypted format
  encrypted?: {
    ciphertext: string;
    nonce: string;
  };
  metadata?: {
    reason: string;
    timestamp: string;
    type: string;
    requester: string;
    encrypted: boolean;
    encryptionTimestamp?: number;
    encryptionVersion?: string;
  };
}

interface RequestData {
  requester: string;
  target: string;
  requestType: number;
  status: number;
  evidenceURI: string;
  attesterSignatures?: number;
  citizenSignatures?: number;
  signatureCount?: number;
  createdAt: number;
}

export default function NachweisPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const account = useActiveAccount();
  const { isAttester, isCitizen, isLoading: statusLoading } = useVerificationStatus();
  const { mutate: sendTransaction, isPending } = useSendTransaction();

  const requestId = params.id as string;
  const contractType = (searchParams.get("contract") || "citizen") as "citizen" | "attester";
  const contract = contractType === "attester" ? attesterNFTContract : citizenNFTContract;

  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [request, setRequest] = useState<RequestData | null>(null);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(true);
  const [isLoadingRequest, setIsLoadingRequest] = useState(true);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [hasUserSigned, setHasUserSigned] = useState(false);
  const [isCheckingSigned, setIsCheckingSigned] = useState(true);
  const [txSuccess, setTxSuccess] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<"attester" | "citizen" | null>(null);

  // Encryption state
  const [isEvidenceEncrypted, setIsEvidenceEncrypted] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [decryptedData, setDecryptedData] = useState<PersonalData | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionError, setDecryptionError] = useState<string | null>(null);

  // Fetch request data from blockchain
  useEffect(() => {
    async function fetchRequest() {
      if (!requestId) return;

      console.log(`🔍 [Nachweis] Fetching request #${requestId} from ${contractType} contract`);
      setIsLoadingRequest(true);

      try {
        const result = await readContract({
          contract,
          method: contractType === "attester"
            ? "function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 signatureCount, uint256 createdAt)"
            : "function getRequest(uint256 requestId) view returns (address requester, address target, uint8 requestType, uint8 status, string evidenceURI, uint256 attesterSignatures, uint256 citizenSignatures, uint256 createdAt)",
          params: [BigInt(requestId)],
        });

        console.log("✅ [Nachweis] Got request data:", result);

        if (contractType === "attester") {
          const [requester, target, requestType, status, evidenceURI, signatureCount, createdAt] = result as unknown as [string, string, number, number, string, bigint, bigint];
          setRequest({
            requester,
            target,
            requestType: Number(requestType),
            status: Number(status),
            evidenceURI,
            signatureCount: Number(signatureCount),
            createdAt: Number(createdAt),
          });
        } else {
          const [requester, target, requestType, status, evidenceURI, attesterSignatures, citizenSignatures, createdAt] = result as unknown as [string, string, number, number, string, bigint, bigint, bigint];
          setRequest({
            requester,
            target,
            requestType: Number(requestType),
            status: Number(status),
            evidenceURI,
            attesterSignatures: Number(attesterSignatures),
            citizenSignatures: Number(citizenSignatures),
            createdAt: Number(createdAt),
          });
        }
      } catch (error) {
        console.error("❌ [Nachweis] Error fetching request:", error);
      } finally {
        setIsLoadingRequest(false);
      }
    }

    fetchRequest();
  }, [requestId, contractType, contract, txSuccess]); // Re-fetch when txSuccess changes

  // Fetch evidence from Supabase ONLY (no fallback)
  useEffect(() => {
    async function fetchEvidence() {
      if (!request?.evidenceURI) return;

      console.log("🔍 [Nachweis] Fetching evidence from Supabase...");
      setIsLoadingEvidence(true);
      setEvidenceError(null);

      try {
        const response = await fetch(`/api/evidence/${requestId}?contract=${contractType}`);

        if (!response.ok) {
          throw new Error(`Evidence not found in Supabase (status ${response.status})`);
        }

        const data = await response.json();
        console.log("✅ [Nachweis] Got evidence from Supabase:", data);
        setEvidence(data.data);

        // Check if evidence is encrypted
        if (isEncrypted(data.data)) {
          console.log("🔒 [Nachweis] Evidence is encrypted");
          setIsEvidenceEncrypted(true);

          // Check if current user is the owner
          const requesterAddress = data.data.metadata?.requester || request.requester;
          if (account && requesterAddress.toLowerCase() === account.address.toLowerCase()) {
            console.log("✓ [Nachweis] User is evidence owner - can decrypt");
            setIsOwner(true);
          } else {
            console.log("✗ [Nachweis] User is NOT evidence owner - cannot decrypt");
            setIsOwner(false);
          }
        } else {
          console.log("📄 [Nachweis] Evidence is plaintext (legacy)");
          setIsEvidenceEncrypted(false);
        }
      } catch (error) {
        console.error("❌ [Nachweis] Error fetching evidence:", error);
        setEvidenceError(
          error instanceof Error
            ? error.message
            : "Evidence not available - may be from old system before Irys migration"
        );
      } finally {
        setIsLoadingEvidence(false);
      }
    }

    if (request) {
      fetchEvidence();
    }
  }, [request, requestId, contractType, account]);

  // Verify contract deployment and user NFT balance
  useEffect(() => {
    async function verifyContracts() {
      try {
        console.log("🔍 [Nachweis] Verifying contract deployment...");

        const attesterCount = await readContract({
          contract: attesterNFTContract,
          method: "function requestCount() view returns (uint256)",
          params: [],
        });
        console.log("✅ [Nachweis] AttesterNFT requestCount:", Number(attesterCount));

        const citizenCount = await readContract({
          contract: citizenNFTContract,
          method: "function requestCount() view returns (uint256)",
          params: [],
        });
        console.log("✅ [Nachweis] CitizenNFT requestCount:", Number(citizenCount));

        if (account) {
          const hasAttester = await readContract({
            contract: attesterNFTContract,
            method: "function hasAttesterNFT(address) view returns (bool)",
            params: [account.address],
          });
          console.log("✅ [Nachweis] User hasAttesterNFT:", hasAttester);

          const hasCitizen = await readContract({
            contract: citizenNFTContract,
            method: "function hasCitizenNFT(address) view returns (bool)",
            params: [account.address],
          });
          console.log("✅ [Nachweis] User hasCitizenNFT:", hasCitizen);
        }
      } catch (error) {
        console.error("❌ [Nachweis] Contract verification failed:", error);
      }
    }
    verifyContracts();
  }, [account]);

  // Check if user has already signed
  useEffect(() => {
    async function checkIfSigned() {
      if (!account || !requestId) {
        setIsCheckingSigned(false);
        return;
      }

      console.log("🔍 [Nachweis] Checking if user has signed request #", requestId);
      setIsCheckingSigned(true);

      try {
        const hasSigned = await readContract({
          contract,
          method: "function hasApprovedRequest(uint256 requestId, address approver) view returns (bool)",
          params: [BigInt(requestId), account.address],
        });

        console.log("✅ [Nachweis] User signed status:", hasSigned);
        setHasUserSigned(hasSigned as boolean);
      } catch (error) {
        console.error("❌ [Nachweis] Error checking signed status:", error);
      } finally {
        setIsCheckingSigned(false);
      }
    }

    checkIfSigned();
  }, [account, requestId, contract, txSuccess]);

  // Auto-select role for users with only one NFT type
  useEffect(() => {
    if (isAttester && !isCitizen && !selectedRole) {
      setSelectedRole("attester");
    } else if (isCitizen && !isAttester && !selectedRole) {
      setSelectedRole("citizen");
    }
  }, [isAttester, isCitizen, selectedRole]);

  const handleDecrypt = useCallback(async () => {
    if (!account || !evidence) {
      console.error("❌ [Nachweis] Cannot decrypt: no account or evidence");
      return;
    }

    if (!isEncrypted(evidence)) {
      console.error("❌ [Nachweis] Evidence is not encrypted");
      return;
    }

    setIsDecrypting(true);
    setDecryptionError(null);

    try {
      // Check encryption version
      const encryptionVersion = evidence.metadata?.encryptionVersion;
      if (!encryptionVersion) {
        throw new Error(
          "Diese Nachweise wurde mit einer alten Verschlüsselungsmethode erstellt und kann nicht entschlüsselt werden. " +
          "Bitte erstelle einen neuen Antrag mit der aktuellen Version."
        );
      }

      console.log(`🔍 [Nachweis] Detected encryption version: ${encryptionVersion}`);

      let dataKey: Uint8Array;

      if (encryptionVersion === 'eip712-v2') {
        // V2 decryption: Decrypt data key using wallet-derived session key
        console.log("🔑 [Nachweis] V2 decryption - deriving session key from wallet...");

        const encryptedKey = evidence.metadata?.encryptedKey;
        const keyNonce = evidence.metadata?.keyNonce;

        if (!encryptedKey || !keyNonce) {
          throw new Error("V2 encryption metadata missing (encryptedKey or keyNonce)");
        }

        dataKey = await decryptDataKey(account, encryptedKey, keyNonce);
        console.log("✅ [Nachweis] Data key decrypted successfully");

      } else if (encryptionVersion === 'eip712-v1') {
        // V1 decryption: Legacy timestamp-based approach (may fail due to signature non-determinism)
        console.log("⚠️ [Nachweis] V1 decryption detected - this may fail due to signature non-determinism");

        const encryptionTimestamp = evidence.metadata?.encryptionTimestamp;
        if (!encryptionTimestamp) {
          throw new Error("Missing encryption timestamp in evidence metadata");
        }

        // Validate timestamp is reasonable
        const now = Date.now();
        const timeDiff = encryptionTimestamp - now;
        const diffDays = Math.abs(timeDiff) / (1000 * 60 * 60 * 24);

        if (diffDays > 365) {
          console.warn(`⚠️ Timestamp seems incorrect:`);
          console.warn(`   Stored: ${encryptionTimestamp} (${new Date(encryptionTimestamp).toISOString()})`);
          console.warn(`   Current: ${now} (${new Date(now).toISOString()})`);
          console.warn(`   Difference: ${Math.round(diffDays)} days`);
        }

        console.log("🔑 [Nachweis] Deriving V1 decryption key with timestamp:", encryptionTimestamp);
        const { key } = await deriveEncryptionKey(account, encryptionTimestamp);
        dataKey = key;

      } else {
        throw new Error(
          `Unbekannte Verschlüsselungsversion: ${encryptionVersion}. ` +
          "Bitte aktualisiere die Anwendung."
        );
      }

      console.log("🔓 [Nachweis] Decrypting personal data...");
      const decrypted = decryptEvidence(evidence.encrypted, dataKey);

      setDecryptedData(decrypted);
      console.log("✅ [Nachweis] Successfully decrypted evidence");
    } catch (error) {
      console.error("❌ [Nachweis] Decryption failed:", error);
      setDecryptionError(
        error instanceof Error
          ? error.message
          : "Entschlüsselung fehlgeschlagen. Stelle sicher, dass du die richtige Wallet verwendest."
      );
    } finally {
      setIsDecrypting(false);
    }
  }, [account, evidence]);

  // Auto-decrypt for owner
  useEffect(() => {
    async function autoDecrypt() {
      if (!isEvidenceEncrypted || !isOwner || !account || !evidence) return;
      if (decryptedData || isDecrypting) return; // Already decrypted or in progress

      console.log("🔓 [Nachweis] Auto-decrypting evidence for owner...");
      await handleDecrypt();
    }

    autoDecrypt();
  }, [isEvidenceEncrypted, isOwner, account, evidence, decryptedData, isDecrypting, handleDecrypt]);

  const handleTestRoundtrip = async () => {
    if (!account) {
      alert("Bitte verbinde deine Wallet zuerst");
      return;
    }

    console.log("🧪 Testing encryption roundtrip...");
    setIsDecrypting(true);
    setDecryptionError(null);

    try {
      const { testEncryptionRoundtrip } = await import("@/lib/crypto/encryption");
      const result = await testEncryptionRoundtrip(account);

      if (result.success) {
        alert(`✅ Roundtrip Test erfolgreich!\n\nTimestamp: ${result.timestamp}\nSignature: ${result.signature?.substring(0, 20)}...\nKey: ${result.key?.substring(0, 20)}...\n\nOriginal: ${result.original}\nDecrypted: ${result.decrypted}`);
        console.log("✅ Roundtrip test successful:", result);
      } else {
        throw new Error(result.error || "Test failed");
      }
    } catch (error) {
      console.error("❌ Roundtrip test failed:", error);
      alert(`❌ Test fehlgeschlagen:\n${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleSign = async () => {
    if (!account) {
      alert("Bitte verbinde deine Wallet");
      return;
    }

    if (hasUserSigned) {
      alert("Du hast diesen Antrag bereits unterschrieben");
      return;
    }

    if (!isAttester && !isCitizen) {
      alert("Du benötigst einen Bürger-Pass oder Bescheiniger-Pass, um zu unterschreiben");
      return;
    }

    if (!selectedRole) {
      alert("Bitte wähle eine Rolle aus (Bescheiniger oder Bürger)");
      return;
    }

    console.log("🖊️ [Nachweis] Starting signature...", {
      requestId,
      isAttester,
      isCitizen,
      selectedRole,
      signingContract: selectedRole === "attester" ? "AttesterNFT" : "CitizenNFT",
    });

    try {
      const signingContract = citizenNFTContract; // Always use CitizenNFT for citizen requests
      const signAsAttester = selectedRole === "attester";
      const signingType = signAsAttester ? "Bescheiniger" : "Bürger";

      console.log(`📝 [Nachweis] Signing as ${signingType}...`, {
        signAsAttester,
        isAttester,
        isCitizen,
      });

      const transaction = prepareContractCall({
        contract: signingContract,
        method: "function approveRequest(uint256 requestId, bool signAsAttester)",
        params: [BigInt(requestId), signAsAttester],
      });

      sendTransaction(transaction, {
        onSuccess: (result) => {
          console.log("✅ [Nachweis] Transaction submitted!", {
            transactionHash: result.transactionHash,
            role: signingType,
          });
          console.log("🔗 [Nachweis] View on Blockscout:", getBlockscoutTxUrl(result.transactionHash));
          console.log("🔗 [Nachweis] View on BaseScan:", getBaseScanTxUrl(result.transactionHash));

          setPendingTxHash(result.transactionHash);
          setTxSuccess(true); // Show success immediately (no event polling)
        },
        onError: (error) => {
          console.error("❌ [Nachweis] Signature failed:", {
            message: error.message,
            code: (error as any)?.code,
            reason: (error as any)?.reason,
          });
          alert(`Unterschrift fehlgeschlagen: ${error.message || "Unbekannter Fehler"}. Bitte versuche es erneut.`);
        },
      });
    } catch (error) {
      console.error("❌ [Nachweis] Error preparing signature:", error);
      alert("Fehler beim Vorbereiten der Unterschrift");
    }
  };

  const getStatusLabel = (status: number) => {
    switch (status) {
      case 0: return "Ausstehend";
      case 1: return "Genehmigt";
      case 2: return "Abgelehnt";
      case 3: return "Ausgeführt";
      default: return "Unbekannt";
    }
  };

  const getStatusColor = (status: number) => {
    switch (status) {
      case 0: return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case 1: return "bg-green-100 text-green-800 border-green-300";
      case 2: return "bg-red-100 text-red-800 border-red-300";
      case 3: return "bg-blue-100 text-blue-800 border-blue-300";
      default: return "bg-muted text-foreground border-border";
    }
  };

  const canSign = account && (isAttester || isCitizen) && !hasUserSigned && request?.status === 0 && !txSuccess;

  return (
    <div className="min-h-screen bg-muted">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Back button */}
          <div className="mb-8">
            <Link
              href="/verifizierung/antraege"
              className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-2"
            >
              ← Zurück zu Anträgen
            </Link>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-medium text-foreground mb-2">
              Nachweis für Antrag #{requestId}
            </h1>
            {request && (
              <div className="flex items-center gap-3">
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(request.status)}`}>
                  {getStatusLabel(request.status)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {contractType === "attester" ? "Bescheiniger-Antrag" : "Bürger-Antrag"}
                </span>
              </div>
            )}
          </div>

          {/* Loading states */}
          {(isLoadingRequest || isLoadingEvidence || statusLoading) && (
            <div className="bg-card border border-border rounded-xl shadow-sm p-12 text-center">
              <div className="inline-block w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-muted-foreground">Lade Nachweis...</p>
            </div>
          )}

          {/* Evidence content */}
          {!isLoadingRequest && !isLoadingEvidence && request && (
            <div className="space-y-6">
              {/* Evidence data */}
              {evidenceError ? (
                <div className="border border-red-300 rounded-lg p-6">
                  <h3 className="font-medium text-foreground mb-2">Fehler beim Laden des Nachweises</h3>
                  <p className="text-sm text-foreground">{evidenceError}</p>
                  <p className="text-xs text-muted-foreground mt-2 font-mono">IPFS URI: {request.evidenceURI}</p>
                </div>
              ) : evidence ? (
                <div className="bg-card border border-border rounded-lg p-8">
                  <h2 className="text-xl font-medium text-foreground mb-6">
                    Antragsteller-Informationen
                    {isEvidenceEncrypted && (
                      <span className="ml-3 text-sm font-normal px-2 py-1 border border-border text-muted-foreground rounded">
                        Verschlüsselt
                      </span>
                    )}
                  </h2>

                  <div className="space-y-4">
                    {/* Encrypted evidence - Owner view */}
                    {isEvidenceEncrypted && isOwner && (
                      <>
                        {isDecrypting ? (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                            <div className="inline-block w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2" />
                            <p className="text-foreground font-medium">Entschlüssele deine Daten...</p>
                            <p className="text-sm text-muted-foreground mt-1">Bitte bestätige die Signatur-Anfrage in deiner Wallet</p>
                          </div>
                        ) : decryptionError ? (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                            <div className="flex items-start gap-3">
                              <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <div className="flex-1">
                                <h3 className="font-medium text-foreground mb-2">Entschlüsselung fehlgeschlagen</h3>
                                <p className="text-sm text-foreground">{decryptionError}</p>
                                <button
                                  onClick={handleDecrypt}
                                  className="mt-4 px-4 py-2 bg-card border border-red-300 hover:border-red-400 text-foreground rounded-lg text-sm font-medium transition-colors hover:bg-red-50"
                                >
                                  Erneut versuchen
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : decryptedData ? (
                          <>
                            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                              <div className="flex items-start gap-3 mb-4">
                                <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                <p className="text-sm text-foreground font-medium">
                                  Deine privaten Daten <span className="text-muted-foreground font-normal">(nur für dich sichtbar)</span>
                                </p>
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <div className="text-sm text-muted-foreground mb-1">Name</div>
                                  <div className="text-lg font-medium text-foreground">{decryptedData.name}</div>
                                </div>
                                <div>
                                  <div className="text-sm text-muted-foreground mb-1">Adresse</div>
                                  <div className="text-foreground">{decryptedData.address}</div>
                                </div>
                              </div>
                            </div>

                            <div className="bg-muted border border-border rounded-lg p-4">
                              <div className="flex items-start gap-2 mb-2">
                                <svg className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-sm text-foreground font-medium">
                                  Persönliche Verifikation
                                </p>
                              </div>
                              <p className="text-sm text-muted-foreground mt-2 ml-7">
                                Zeige diesen Bildschirm einem Bescheiniger zusammen mit deinem Personalausweis oder offiziellen Dokumenten.
                                Der Bescheiniger kann deine Identität überprüfen und den Antrag unterschreiben.
                              </p>
                              <div className="mt-3 pt-3 border-t border-border ml-7">
                                <button
                                  onClick={handleTestRoundtrip}
                                  disabled={isDecrypting}
                                  className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                  </svg>
                                  Verschlüsselungstest durchführen
                                </button>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </>
                    )}

                    {/* Encrypted evidence - Non-owner view (Attester) */}
                    {isEvidenceEncrypted && !isOwner && (
                      <div className="bg-muted border border-border rounded-lg p-6">
                        <div className="flex items-start gap-3 mb-3">
                          <svg className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <div className="flex-1">
                            <p className="text-sm text-foreground font-medium mb-2">
                              Dieser Nachweis ist verschlüsselt
                            </p>
                            <p className="text-sm text-muted-foreground mb-3">
                              Die persönlichen Daten (Name und Adresse) sind zum Schutz der Privatsphäre verschlüsselt.
                            </p>
                          </div>
                        </div>
                        <div className="ml-8">
                          <p className="text-sm text-foreground font-medium mb-2">
                            Um diesen Bürger zu verifizieren:
                          </p>
                          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                            <li>Bitte den Antragsteller, dir seine entschlüsselten Daten auf seinem Gerät zu zeigen</li>
                            <li>Überprüfe die Identität mit offiziellen Dokumenten (Personalausweis, Reisepass, etc.)</li>
                            <li>Wenn verifiziert, unterschreibe den Antrag unten</li>
                          </ol>
                        </div>
                      </div>
                    )}

                    {/* Legacy plaintext evidence */}
                    {!isEvidenceEncrypted && evidence.name && evidence.address && (
                      <>
                        <div className="border border-border rounded-lg p-4 mb-4">
                          <p className="text-sm text-foreground">
                            Dieser Nachweis wurde vor der Verschlüsselung erstellt. Neue Anträge werden automatisch verschlüsselt.
                          </p>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Name</div>
                          <div className="text-lg font-medium text-foreground">{evidence.name}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Adresse</div>
                          <div className="text-foreground">{evidence.address}</div>
                        </div>
                      </>
                    )}

                    {/* Public metadata (visible to everyone) */}
                    <div className="border-t border-border pt-4 mt-4">
                      <h3 className="text-sm font-medium text-foreground mb-3">Öffentliche Informationen</h3>
                      <div className="space-y-3">
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Grund / Begründung</div>
                          <div className="text-foreground">
                            {isEvidenceEncrypted && evidence.metadata?.reason
                              ? evidence.metadata.reason
                              : evidence.reason}
                          </div>
                        </div>

                        {(evidence.timestamp || evidence.metadata?.timestamp) && (
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">Eingereicht am</div>
                            <div className="text-sm text-foreground">
                              {new Date(
                                (isEvidenceEncrypted && evidence.metadata?.timestamp) || evidence.timestamp || ""
                              ).toLocaleString("de-DE")}
                            </div>
                          </div>
                        )}

                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Wallet-Adresse</div>
                          <div className="font-mono text-sm text-foreground">
                            {(isEvidenceEncrypted && evidence.metadata?.requester) || request.requester}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-muted border border-border rounded-xl p-6">
                  <p className="text-muted-foreground">Lade Nachweis-Daten...</p>
                </div>
              )}

              {/* Signature progress */}
              <div className="bg-card border border-border rounded-xl shadow-sm p-8">
                <h2 className="text-xl font-medium text-foreground mb-6">📊 Unterschriften</h2>

                {contractType === "citizen" && request.attesterSignatures !== undefined && request.citizenSignatures !== undefined ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Bescheiniger</span>
                        <span className="font-medium">{request.attesterSignatures} / 1</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-gray-400 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min((request.attesterSignatures / 1) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Bürger</span>
                        <span className="font-medium">{request.citizenSignatures} / 1</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-gray-400 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(request.citizenSignatures * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 p-4 border border-border rounded-lg">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Benötigt:</span> 1 Bescheiniger + 1 Bürger Unterschrift (mindestens 2 verschiedene Personen)
                      </p>
                    </div>
                  </div>
                ) : request.signatureCount !== undefined ? (
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Bescheiniger</span>
                      <span className="font-medium">{request.signatureCount} / 2</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-gray-400 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min((request.signatureCount / 2) * 100, 100)}%` }}
                      />
                    </div>

                    <div className="mt-4 p-4 border border-border rounded-lg">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Benötigt:</span> 2 Bescheiniger Unterschriften
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Signature button */}
              {!account ? (
                <div className="border border-border rounded-lg p-6 text-center">
                  <p className="text-foreground">Bitte verbinde deine Wallet, um zu unterschreiben</p>
                </div>
              ) : isCheckingSigned ? (
                <div className="border border-border rounded-lg p-6 text-center">
                  <div className="inline-block w-6 h-6 border-4 border-border border-t-transparent rounded-full animate-spin mb-2" />
                  <p className="text-sm text-muted-foreground">Prüfe Unterschriftsstatus...</p>
                </div>
              ) : txSuccess ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-8">
                  <div className="text-center mb-6">
                    <svg className="w-16 h-16 text-green-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-xl font-medium text-foreground mb-2">Erfolgreich unterschrieben</h3>
                    <p className="text-muted-foreground mb-4">Die Unterschrift wurde erfolgreich auf der Blockchain gespeichert.</p>
                  </div>

                  {pendingTxHash && (
                    <div className="space-y-3 mb-6">
                      <div className="flex gap-2">
                        <a
                          href={getBlockscoutTxUrl(pendingTxHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 border border-border hover:border-gray-400 text-foreground px-4 py-2 rounded-lg text-center text-sm font-medium transition-colors hover:bg-accent"
                        >
                          Transaktion auf Blockscout ansehen
                        </a>
                      </div>

                      <a
                        href={getBlockscoutContractEventsUrl(contract.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-center text-sm text-muted-foreground hover:text-foreground"
                      >
                        Alle Contract Events ansehen →
                      </a>
                    </div>
                  )}

                  <Link
                    href="/verifizierung/antraege"
                    className="block text-center border border-border hover:border-gray-400 text-foreground px-6 py-3 rounded-lg transition-colors font-medium hover:bg-accent"
                  >
                    ← Zurück zu allen Anträgen
                  </Link>
                </div>
              ) : hasUserSigned ? (
                <div className="border border-border rounded-lg p-6 text-center">
                  <p className="text-foreground font-medium">Du hast diesen Antrag bereits unterschrieben</p>
                </div>
              ) : request.status !== 0 ? (
                <div className="border border-border rounded-lg p-6 text-center">
                  <p className="text-foreground">Dieser Antrag ist {getStatusLabel(request.status).toLowerCase()} und kann nicht mehr unterschrieben werden</p>
                </div>
              ) : !isAttester && !isCitizen ? (
                <div className="border border-border rounded-lg p-6 text-center">
                  <p className="text-foreground">Du benötigst einen Bürger-Pass oder Bescheiniger-Pass, um zu unterschreiben</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Role selection for dual NFT holders */}
                  {isAttester && isCitizen && (
                    <div className="border border-border rounded-lg p-6">
                      <h3 className="font-medium text-foreground mb-3">
                        Du besitzt beide NFTs - Wähle deine Rolle
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Du kannst entscheiden, als <strong>Bescheiniger</strong> oder <strong>Bürger</strong> zu unterschreiben.
                      </p>

                      <div className="bg-muted rounded-lg p-4 mb-4">
                        <p className="text-sm font-medium text-foreground mb-2">Aktuelle Unterschriften:</p>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div>• Bescheiniger: {request?.attesterSignatures || 0}/1</div>
                          <div>• Bürger: {request?.citizenSignatures || 0}/1</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                          selectedRole === "attester"
                            ? "bg-muted border-gray-400"
                            : "bg-card border-border hover:border-border"
                        }`}>
                          <input
                            type="radio"
                            name="role"
                            value="attester"
                            checked={selectedRole === "attester"}
                            onChange={() => setSelectedRole("attester")}
                            className="w-4 h-4"
                          />
                          <div>
                            <div className="font-medium text-foreground">Als Bescheiniger unterschreiben</div>
                            <div className="text-xs text-muted-foreground">Deine Unterschrift wird als Bescheiniger-Stimme gezählt</div>
                          </div>
                        </label>

                        <label className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                          selectedRole === "citizen"
                            ? "bg-muted border-gray-400"
                            : "bg-card border-border hover:border-border"
                        }`}>
                          <input
                            type="radio"
                            name="role"
                            value="citizen"
                            checked={selectedRole === "citizen"}
                            onChange={() => setSelectedRole("citizen")}
                            className="w-4 h-4"
                          />
                          <div>
                            <div className="font-medium text-foreground">Als Bürger unterschreiben</div>
                            <div className="text-xs text-muted-foreground">Deine Unterschrift wird als Bürger-Stimme gezählt</div>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Info for single NFT holders */}
                  {((isAttester && !isCitizen) || (isCitizen && !isAttester)) && (
                    <div className="border border-border rounded-lg p-4">
                      <p className="text-sm text-foreground">
                        Du unterschreibst als <strong>{isAttester ? "Bescheiniger" : "Bürger"}</strong> für diesen Bürger-Antrag.
                      </p>
                      {request && (
                        <div className="mt-3 text-xs text-muted-foreground">
                          <div>• Bescheiniger: {request.attesterSignatures || 0}/1</div>
                          <div>• Bürger: {request.citizenSignatures || 0}/1</div>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleSign}
                    disabled={!canSign || isPending || !selectedRole}
                    className="w-full bg-foreground hover:bg-foreground text-white px-8 py-4 rounded-lg transition-colors font-medium text-lg disabled:bg-muted disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {isPending ? (
                      <>
                        <div className="inline-block w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" />
                        Unterschreibe...
                      </>
                    ) : (
                      <>
                        Unterschreiben {selectedRole && `als ${selectedRole === "attester" ? "Bescheiniger" : "Bürger"}`}
                      </>
                    )}
                  </button>

                  <p className="text-xs text-center text-muted-foreground">
                    Diese Transaktion ist kostenlos (gasless)
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
