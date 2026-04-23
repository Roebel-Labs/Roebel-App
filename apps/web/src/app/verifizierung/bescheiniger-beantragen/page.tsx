"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { useVerificationStatus } from "@/hooks/useVerificationStatus";
import { prepareContractCall, waitForReceipt } from "thirdweb";
import { attesterNFTContract } from "@/lib/verification-contracts";
import { client } from "@/app/client";
import Link from "next/link";
import { de } from "@/lib/translations/de";
import { QRCodeSVG } from "qrcode.react";
import { uploadToIrys } from "@/lib/irys";
import {
  deriveEncryptionKey,
  encryptEvidence,
  type PersonalData,
  type PublicMetadata,
  type EncryptedEvidence,
} from "@/lib/crypto/encryption";

type Step = "eligibility" | "upload" | "create" | "success";

interface EvidenceData {
  name: string;
  address: string;
  reason: string;
  file?: File;
}

export default function RequestAttesterNFT() {
  const account = useActiveAccount();
  const { isAttester, isLoading: statusLoading } = useVerificationStatus();

  const [currentStep, setCurrentStep] = useState<Step>("eligibility");
  const [evidence, setEvidence] = useState<EvidenceData>({
    name: "",
    address: "",
    reason: "",
  });
  const [irysId, setIrysId] = useState<string>("");
  const [irysUrl, setIrysUrl] = useState<string>("");
  const [isUploadingIrys, setIsUploadingIrys] = useState(false);
  const [requestId, setRequestId] = useState<string>("");
  const [encryptedEvidencePayload, setEncryptedEvidencePayload] = useState<EncryptedEvidence | null>(null);

  const { mutate: sendTransaction, isPending } = useSendTransaction();

  // Check eligibility
  const isEligible = account && !isAttester && !statusLoading;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setEvidence({ ...evidence, file: e.target.files[0] });
    }
  };

  const handleUploadToIrys = async () => {
    if (!account) {
      alert("Bitte verbinde deine Wallet zuerst");
      return;
    }

    setIsUploadingIrys(true);
    try {
      console.log("🔐 Starting encrypted evidence upload...");

      // Step 1: Derive encryption key from wallet signature (EIP-712)
      console.log("🔑 Deriving encryption key from wallet (EIP-712)...");
      const { key: encryptionKey, timestamp: encryptionTimestamp } = await deriveEncryptionKey(account);

      // Step 2: Separate personal data from public metadata
      const personalData: PersonalData = {
        name: evidence.name,
        address: evidence.address,
      };

      const publicMetadata: PublicMetadata = {
        reason: evidence.reason,
        timestamp: new Date().toISOString(),
        type: "attester_attestation",
        requester: account.address,
        encrypted: true,
        encryptionTimestamp, // Store for deterministic decryption
        encryptionVersion: 'eip712-v1', // Track encryption algorithm version
      };

      console.log("📦 Personal data to encrypt:", {
        name: personalData.name.substring(0, 3) + "***",
        address: personalData.address.substring(0, 10) + "...",
      });

      // Step 3: Encrypt personal data
      console.log("🔒 Encrypting personal data...");
      const encryptedBlob = encryptEvidence(personalData, encryptionKey);

      // Step 4: Create encrypted evidence payload
      const encryptedEvidence: EncryptedEvidence = {
        encrypted: encryptedBlob,
        metadata: publicMetadata,
      };

      // Store for later API call
      setEncryptedEvidencePayload(encryptedEvidence);

      console.log("📤 Uploading encrypted evidence to Irys...");
      console.log("   Public metadata:", publicMetadata);

      // Step 5: Upload to Irys (contains encrypted personal data + public metadata)
      const jsonString = JSON.stringify(encryptedEvidence, null, 2);

      const irysReceipt = await uploadToIrys(account, jsonString, [
        { name: "Content-Type", value: "application/json" },
        { name: "App", value: "HomeTown DAO Verification" },
        { name: "Type", value: "AttesterAttestation" },
        { name: "Encrypted", value: "true" },
        { name: "EncryptionVersion", value: "1" },
        // ❌ REMOVED: RequesterName tag (privacy leak!)
      ]);

      setIrysId(irysReceipt.id);
      setIrysUrl(irysReceipt.url);

      console.log("✅ Encrypted evidence uploaded to Irys:", irysReceipt.url);
      console.log("📋 Receipt ID:", irysReceipt.id);
      console.log("🔒 Personal data is encrypted and GDPR-compliant!");

      setCurrentStep("create");
    } catch (error) {
      console.error("❌ Encrypted upload failed:", error);
      alert(
        error instanceof Error
          ? `Verschlüsselung fehlgeschlagen: ${error.message}`
          : de.verification.messages.ipfsUploadFailed
      );
    } finally {
      setIsUploadingIrys(false);
    }
  };

  const handleCreateRequest = async () => {
    if (!irysUrl) return;

    try {
      const transaction = prepareContractCall({
        contract: attesterNFTContract,
        method: "function createAttestationRequest(string evidenceURI) returns (uint256)",
        params: [irysUrl], // Use full Irys gateway URL
      });

      sendTransaction(transaction, {
        onSuccess: async (result) => {
          console.log("Transaction successful:", result);

          try {
            // Wait for transaction receipt
            console.log("⏳ Waiting for receipt...");
            const receipt = await waitForReceipt({
              client,
              chain: attesterNFTContract.chain,
              transactionHash: result.transactionHash,
            });

            console.log("📄 Receipt received:", receipt);

            // Find AttestationRequestCreated event
            const event = receipt.logs.find(log =>
              log.address.toLowerCase() === attesterNFTContract.address.toLowerCase() &&
              log.topics.length >= 2
            );

            if (event && event.topics[1]) {
              const requestIdHex = event.topics[1];
              const requestIdNumber = parseInt(requestIdHex, 16);
              const extractedRequestId = requestIdNumber.toString();
              setRequestId(extractedRequestId);
              console.log("✅ Extracted Request ID:", requestIdNumber);

              // Store evidence in Supabase (encrypted format)
              try {
                console.log("💾 Storing encrypted evidence in Supabase...");
                const storeResponse = await fetch("/api/evidence/store", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    requestId: extractedRequestId,
                    contractType: "attester",
                    irysId: irysId,
                    irysUrl: irysUrl,
                    evidencePayload: encryptedEvidencePayload,
                    isEncrypted: true,
                    requester: account?.address,
                  }),
                });

                if (!storeResponse.ok) {
                  const errorData = await storeResponse.json();
                  console.error("❌ Failed to store in Supabase:", errorData);
                } else {
                  const storeData = await storeResponse.json();
                  console.log("✅ Evidence stored in Supabase:", storeData);
                }
              } catch (supabaseError) {
                console.error("❌ Error storing in Supabase:", supabaseError);
                // Don't fail the entire flow if Supabase storage fails
                // Evidence is still on Irys and blockchain
              }
            } else {
              console.warn("⚠️ Could not parse requestId from logs, using fallback");
              setRequestId("pending");
            }
          } catch (parseError) {
            console.error("❌ Error parsing requestId:", parseError);
            setRequestId("pending");
          }

          setCurrentStep("success");
        },
        onError: (error) => {
          console.error("Transaction failed:", error);
          alert(de.errors.transactionFailed);
        },
      });
    } catch (error) {
      console.error("Error creating request:", error);
      alert(de.errors.generic);
    }
  };

  const renderStepIndicator = () => {
    const steps = [
      { key: "eligibility", label: de.verification.steps.checkEligibility },
      { key: "upload", label: de.verification.steps.uploadEvidence },
      { key: "create", label: de.verification.steps.createRequest },
      { key: "success", label: de.verification.steps.success },
    ];

    const currentIndex = steps.findIndex(s => s.key === currentStep);

    return (
      <div className="flex items-center justify-between mb-8">
        {steps.map((step, index) => (
          <div key={step.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-colors ${
                  index <= currentIndex
                    ? "bg-black text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {index + 1}
              </div>
              <div className="text-xs text-center mt-2 max-w-[100px]">
                {step.label}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`h-1 flex-1 mx-2 transition-colors ${
                  index < currentIndex ? "bg-black" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-muted">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <Link href="/verifizierung" className="text-muted-foreground hover:text-foreground transition-colors">
              ← Zurück zur Verifizierung
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-medium text-foreground">{de.verification.requestAttesterNFT}</h1>
            <p className="text-muted-foreground mt-1">Werde Bescheiniger und hilf bei der Community-Verifizierung</p>
          </div>

          <div className="bg-card border border-border rounded-xl shadow-sm p-8">
            {renderStepIndicator()}

            {/* Step 1: Eligibility Check */}
            {currentStep === "eligibility" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-medium text-foreground mb-4">
                    {de.verification.steps.checkEligibility}
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    Prüfe, ob du berechtigt bist, einen Bescheiniger-Pass Antrag zu stellen
                  </p>
                </div>

                {/* Warning about Attester role */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <h4 className="font-medium text-yellow-900 mb-2 flex items-center gap-2">
                    <span>⚠️</span>
                    {de.verification.attesterRoleWarning}
                  </h4>
                  <p className="text-sm text-yellow-800">
                    {de.verification.attesterRoleDescription}
                  </p>
                </div>

                {!account ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">{de.errors.walletNotConnected}</p>
                  </div>
                ) : statusLoading ? (
                  <div className="text-center py-8">
                    <div className="inline-block w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-muted-foreground">{de.verification.messages.eligibilityChecking}</p>
                  </div>
                ) : isAttester ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-800 font-medium mb-2">
                      {de.verification.messages.alreadyHasNFT}
                    </p>
                    <p className="text-sm text-red-700">
                      Du besitzt bereits einen Bescheiniger-Pass und musst keinen neuen Antrag stellen.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-sm text-green-800 font-medium">
                        ✓ {de.verification.messages.eligible}
                      </p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-sm text-blue-800 font-medium mb-2">
                        Anforderungen:
                      </p>
                      <p className="text-sm text-blue-800">
                        Dein Antrag benötigt <strong>2 Bescheiniger-Unterschriften</strong>, um genehmigt zu werden.
                      </p>
                    </div>

                    <button
                      onClick={() => setCurrentStep("upload")}
                      className="w-full bg-black hover:bg-foreground/90 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                    >
                      {de.common.next} →
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Step 2: Upload Evidence */}
            {currentStep === "upload" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-medium text-foreground mb-4">
                    {de.verification.steps.uploadEvidence}
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    Gib deine Informationen an und lade einen Nachweis hoch
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {de.verification.fullName} *
                    </label>
                    <input
                      type="text"
                      value={evidence.name}
                      onChange={(e) => setEvidence({ ...evidence, name: e.target.value })}
                      placeholder="Max Mustermann"
                      className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {de.verification.address} *
                    </label>
                    <input
                      type="text"
                      value={evidence.address}
                      onChange={(e) => setEvidence({ ...evidence, address: e.target.value })}
                      placeholder="Musterstraße 1, 17207 Röbel/Müritz"
                      className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {de.verification.reason} *
                    </label>
                    <textarea
                      value={evidence.reason}
                      onChange={(e) => setEvidence({ ...evidence, reason: e.target.value })}
                      placeholder="Beschreibe, warum du als Bescheiniger aktiv werden möchtest und welche Erfahrung du mitbringst..."
                      rows={4}
                      className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {de.verification.uploadFile} (optional)
                    </label>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-black transition-colors cursor-pointer">
                      <input
                        type="file"
                        onChange={handleFileChange}
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        id="file-upload"
                      />
                      <label htmlFor="file-upload" className="cursor-pointer">
                        <div className="text-muted-foreground mb-2">
                          {evidence.file ? evidence.file.name : de.verification.dragDropFile}
                        </div>
                        <div className="text-xs text-muted-foreground">{de.verification.supportedFormats}</div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setCurrentStep("eligibility")}
                    className="flex-1 bg-card hover:bg-accent border border-border text-foreground px-6 py-3 rounded-lg transition-colors font-medium"
                  >
                    ← {de.common.back}
                  </button>
                  <button
                    onClick={handleUploadToIrys}
                    disabled={!evidence.name || !evidence.address || !evidence.reason || isUploadingIrys}
                    className="flex-1 bg-black hover:bg-foreground/90 text-white px-6 py-3 rounded-lg transition-colors font-medium disabled:bg-muted disabled:cursor-not-allowed"
                  >
                    {isUploadingIrys ? de.common.loading : `${de.verification.uploadToIPFS} →`}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Create Request */}
            {currentStep === "create" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-medium text-foreground mb-4">
                    {de.verification.steps.createRequest}
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    Prüfe deine Angaben und erstelle den Antrag
                  </p>
                </div>

                <div className="bg-muted border border-border rounded-lg p-6 space-y-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Name</div>
                    <div className="font-medium">{evidence.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Adresse</div>
                    <div className="font-medium">{evidence.address}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Grund</div>
                    <div className="text-sm">{evidence.reason}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Irys ID</div>
                    <div className="font-mono text-sm break-all">{irysId}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Irys URL</div>
                    <a
                      href={irysUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs break-all text-primary hover:underline"
                    >
                      {irysUrl}
                    </a>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    Nach der Erstellung wartet dein Antrag auf <strong>2 Bescheiniger-Unterschriften</strong>.
                  </p>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setCurrentStep("upload")}
                    disabled={isPending}
                    className="flex-1 bg-card hover:bg-accent border border-border text-foreground px-6 py-3 rounded-lg transition-colors font-medium disabled:opacity-50"
                  >
                    ← {de.common.back}
                  </button>
                  <button
                    onClick={handleCreateRequest}
                    disabled={isPending}
                    className="flex-1 bg-black hover:bg-foreground/90 text-white px-6 py-3 rounded-lg transition-colors font-medium disabled:bg-muted disabled:cursor-not-allowed"
                  >
                    {isPending ? de.common.waitingForSignature : de.common.submit}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Success */}
            {currentStep === "success" && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-6xl mb-4">✓</div>
                  <h2 className="text-2xl font-medium text-foreground">
                    {de.verification.messages.requestCreatedSuccess}
                  </h2>
                  <p className="text-muted-foreground">
                    {de.verification.messages.waitingForSignatures}
                  </p>
                </div>

                {requestId && requestId !== "pending" && (
                  <>
                    {/* Request ID Display */}
                    <div className="bg-muted border border-border rounded-lg p-4 text-center">
                      <div className="text-xs text-muted-foreground mb-1">{de.verification.requestId}</div>
                      <div className="font-mono font-medium text-lg">#{requestId}</div>
                    </div>

                    {/* QR Code & Share Section */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                      <h3 className="font-medium text-blue-900 mb-4 text-center">
                        📱 Antrag mit Bescheiniger teilen
                      </h3>
                      <p className="text-sm text-blue-800 mb-4 text-center">
                        Zeige diesen QR-Code einem Bescheiniger, damit er deinen Antrag direkt öffnen kann
                      </p>

                      {/* QR Code */}
                      <div className="bg-card p-6 rounded-lg flex justify-center mb-4">
                        <QRCodeSVG
                          value={`https://roebel.app/verifizierung/nachweis/${requestId}?contract=attester`}
                          size={200}
                          level="H"
                        />
                      </div>

                      {/* Copy Link Button */}
                      <button
                        onClick={() => {
                          const link = `https://roebel.app/verifizierung/nachweis/${requestId}?contract=attester`;
                          navigator.clipboard.writeText(link);
                          alert("Link kopiert!");
                        }}
                        className="w-full bg-foreground hover:bg-foreground text-white px-4 py-3 rounded-lg font-medium transition-colors mb-3"
                      >
                        Link kopieren
                      </button>

                      {/* Direct Link */}
                      <div className="text-center">
                        <Link
                          href={`/verifizierung/nachweis/${requestId}?contract=attester`}
                          className="text-sm text-muted-foreground hover:text-foreground"
                        >
                          Direkt zum Antrag ansehen →
                        </Link>
                      </div>
                    </div>
                  </>
                )}

                {requestId === "pending" && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <p className="text-sm text-yellow-800">
                      Dein Antrag wurde erstellt. Die Antrags-ID wird gerade ermittelt...
                    </p>
                    <p className="text-xs text-yellow-700 mt-2">
                      Du findest deinen Antrag unter &ldquo;Anträge prüfen&rdquo;
                    </p>
                  </div>
                )}

                <div className="bg-muted border border-border rounded-lg p-6">
                  <h3 className="font-medium text-foreground mb-3">Nächste Schritte</h3>
                  <ol className="space-y-2 text-sm text-foreground">
                    <li>1. Zeige den QR-Code einem Bescheiniger</li>
                    <li>2. Er kann deinen Antrag prüfen und unterschreiben</li>
                    <li>3. Nach 2 Bescheiniger-Unterschriften wird dein Pass vergeben</li>
                  </ol>
                </div>

                <Link
                  href="/verifizierung"
                  className="block text-center bg-black hover:bg-foreground/90 text-white px-8 py-3 rounded-lg transition-colors font-medium"
                >
                  Zurück zur Verifizierung
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
