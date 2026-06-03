"use client";

import { useActiveAccount, useReadContract, useSendTransaction } from "thirdweb/react";
import { governorContract, nftContract } from "@/lib/contracts";
import { balanceOf } from "thirdweb/extensions/erc721";
import { prepareContractCall, toWei, waitForReceipt } from "thirdweb";
import { ethers } from "ethers";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { uploadToIrys } from "@/lib/irys";
import { client } from "@/app/client";
import { useVerificationStatus } from "@/hooks/useVerificationStatus";
import { IrysBalanceCard } from "@/components/admin/IrysBalanceCard";
import { de } from "@/lib/translations/de";

type UploadStage = "idle" | "uploading" | "submitting" | "confirming" | "success" | "error";

interface PollInfo {
  proposalId: string;
  pollId: string;
  pollAddress: string;
  tallyAddress: string;
}

interface CreateProposalFormProps {
  /** Where to navigate after a successful submission. */
  redirectTo?: string;
  /** Target of the in-card "Abbrechen" link. */
  cancelHref?: string;
}

export function CreateProposalForm({
  redirectTo = "/proposals",
  cancelHref = "/proposals",
}: CreateProposalFormProps) {
  const account = useActiveAccount();
  const router = useRouter();
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [error, setError] = useState<string>("");
  const [irysUrl, setIrysUrl] = useState<string>("");
  const [pollInfo, setPollInfo] = useState<PollInfo | null>(null);

  const { mutate: sendTransaction } = useSendTransaction();
  const { isAttester, isLoading: statusLoading } = useVerificationStatus();

  useReadContract(balanceOf, {
    contract: nftContract,
    owner: account?.address || "",
    queryOptions: { enabled: !!account },
  });

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const [value, setValue] = useState("");
  const [calldata, setCalldata] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;

    setError("");
    console.log("🚀 Starting proposal creation process...");

    try {
      // Step 1: Upload description to Irys
      setUploadStage("uploading");
      console.log("📤 Step 1: Uploading to Irys...");
      console.log("🖊️ HTML content:", description);

      const irysReceipt = await uploadToIrys(account, description, [
        { name: "Content-Type", value: "text/html" },
        { name: "App", value: "HomeTown DAO" },
        { name: "Type", value: "Proposal" },
        { name: "Title", value: title },
      ]);

      setIrysUrl(irysReceipt.url);
      console.log("✅ Step 1 complete: Content uploaded to Irys");

      // Step 2: Create on-chain proposal with Irys reference
      setUploadStage("submitting");
      console.log("⛓️ Step 2: Creating proposal on-chain...");

      // Prepare proposal parameters
      const targets = [(targetAddress || governorContract.address) as `0x${string}`];
      const values = [value ? toWei(value) : 0n];
      const calldatas = [(calldata || "0x") as `0x${string}`];

      // Create description with Irys reference
      const fullDescription = `# ${title}\n\n📄 **Full Proposal:** ${irysReceipt.url}\n\n[View Complete Proposal on Irys](${irysReceipt.url})`;

      console.log("📋 On-chain description:", fullDescription);

      const transaction = prepareContractCall({
        contract: governorContract,
        method: "function propose(address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) public returns (uint256)",
        params: [targets, values, calldatas, fullDescription],
      });

      setUploadStage("confirming");

      sendTransaction(transaction, {
        onSuccess: async (result) => {
          console.log("✅ Step 2 complete: Proposal created on-chain");
          console.log("📝 Transaction result:", result);

          // Step 2.5: Wait for receipt and extract numeric proposalId from event
          try {
            console.log("⏳ Waiting for transaction receipt...");
            const receipt = await waitForReceipt({
              client,
              chain: governorContract.chain,
              transactionHash: result.transactionHash,
            });
            console.log("📄 Receipt received:", receipt);

            // Parse ProposalCreated event from receipt logs
            // ProposalCreated event signature: keccak256("ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)")
            const PROPOSAL_CREATED_TOPIC = "0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0";

            const proposalCreatedLog = receipt.logs.find((log) =>
              log.address.toLowerCase() === governorContract.address.toLowerCase() &&
              log.topics[0] === PROPOSAL_CREATED_TOPIC
            );

            if (!proposalCreatedLog) {
              console.error("❌ No ProposalCreated event found in receipt logs:", receipt.logs);
              throw new Error("No ProposalCreated event found in transaction receipt");
            }

            console.log("📋 Found ProposalCreated log:", proposalCreatedLog);

            // Decode the event using ethers
            const iface = new ethers.Interface([
              "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)"
            ]);

            const decodedEvent = iface.parseLog({
              topics: proposalCreatedLog.topics,
              data: proposalCreatedLog.data
            });

            if (!decodedEvent) {
              throw new Error("Failed to decode ProposalCreated event");
            }

            const numericProposalId = decodedEvent.args.proposalId.toString();
            const voteStart = decodedEvent.args.voteStart.toString();
            const voteEnd = decodedEvent.args.voteEnd.toString();

            console.log("🔢 Extracted numeric proposalId:", numericProposalId);
            console.log("📊 Vote period:", voteStart, "to", voteEnd);

            // MACI-specific: decode PollLinked(uint256 indexed proposalId, address poll, address tally, uint256 pollId)
            try {
              const POLL_LINKED_TOPIC = ethers.id("PollLinked(uint256,address,address,uint256)");
              const pollLinkedLog = receipt.logs.find((log) =>
                log.address.toLowerCase() === governorContract.address.toLowerCase() &&
                log.topics[0] === POLL_LINKED_TOPIC
              );
              if (pollLinkedLog) {
                const pollIface = new ethers.Interface([
                  "event PollLinked(uint256 indexed proposalId, address poll, address tally, uint256 pollId)"
                ]);
                const decodedPoll = pollIface.parseLog({
                  topics: pollLinkedLog.topics,
                  data: pollLinkedLog.data,
                });
                if (decodedPoll) {
                  const info: PollInfo = {
                    proposalId: numericProposalId,
                    pollId: decodedPoll.args.pollId.toString(),
                    pollAddress: decodedPoll.args.poll,
                    tallyAddress: decodedPoll.args.tally,
                  };
                  console.log("🔐 MACI PollLinked:", info);
                  setPollInfo(info);
                }
              } else {
                console.warn("PollLinked event not found — is the new MACI Governor wired correctly?");
              }
            } catch (pollErr) {
              console.warn("PollLinked decode failed (proposal still on-chain):", pollErr);
            }

            // Step 3: Store in Supabase for fast retrieval
            try {
              console.log("💾 Step 3: Storing proposal in Supabase...");

              const storeResponse = await fetch("/api/proposals/store", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  proposalId: result.transactionHash, // Transaction hash for URL routing
                  blockchainProposalId: numericProposalId, // Numeric ID for blockchain calls
                  title,
                  markdown: description,
                  irysContentId: irysReceipt.id,
                  irysUrl: irysReceipt.url,
                  transactionHash: result.transactionHash,
                  proposerAddress: account.address,
                  blockNumber: Number(receipt.blockNumber),
                  snapshotBlock: Number(voteStart),
                  deadlineBlock: Number(voteEnd),
                  category: "general",
                }),
              });

              if (!storeResponse.ok) {
                console.warn("⚠️ Failed to store in Supabase, but proposal is on-chain");
                // Don't fail the whole flow, proposal is already on-chain
              } else {
                console.log("✅ Step 3 complete: Stored in Supabase");
              }
            } catch (supabaseError) {
              console.error("❌ Supabase storage error:", supabaseError);
              // Don't fail the whole flow
            }

            setUploadStage("success");

            setTimeout(() => {
              console.log("🔄 Redirecting...");
              router.push(redirectTo);
            }, 2000);
          } catch (eventError) {
            console.error("❌ Failed to extract proposalId from event:", eventError);
            setError(
              "Proposal created on-chain, but failed to extract proposal ID. Check blockchain explorer for transaction: " + result.transactionHash
            );
            setUploadStage("error");
          }
        },
        onError: (txError) => {
          console.error("❌ Transaction failed:", txError);
          setError(
            txError instanceof Error
              ? txError.message
              : "Transaction failed. Your content is saved on Irys at: " + irysReceipt.url
          );
          setUploadStage("error");
        },
      });
    } catch (uploadError) {
      console.error("❌ Upload to Irys failed:", uploadError);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Failed to upload to Irys. Please try again."
      );
      setUploadStage("error");
    }
  };

  const getButtonText = () => {
    switch (uploadStage) {
      case "uploading":
        return "Lade zu dauerhaftem Speicher hoch...";
      case "submitting":
        return de.proposals.creatingProposal;
      case "confirming":
        return "Warte auf Bestätigung...";
      case "success":
        return de.common.transactionSuccess;
      case "error":
        return "Nochmal versuchen";
      default:
        return de.proposals.createProposal;
    }
  };

  const isProcessing = ["uploading", "submitting", "confirming", "success"].includes(uploadStage);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-8 lg:p-12">
      <h1 className="text-3xl font-medium mb-2 text-foreground">{de.proposals.createProposalForm.title}</h1>
      <p className="text-muted-foreground mb-8">{de.proposals.createProposalForm.subtitle}</p>

      {statusLoading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-muted-foreground">{de.common.loading}</p>
        </div>
      ) : !account ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            {de.common.connectWallet}
          </p>
        </div>
      ) : !isAttester ? (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">🚫</div>
          <h2 className="text-xl font-medium text-red-900 mb-2">
            {de.errors.unauthorized}
          </h2>
          <p className="text-red-800 mb-6">
            {de.proposals.createProposalForm.notAttester}
          </p>
          <Link
            href="/verifizierung/bescheiniger-beantragen"
            className="inline-flex items-center justify-center bg-black hover:bg-foreground/90 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Bescheiniger werden →
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-blue-900">
              Verschlüsselte Abstimmung (MACI v2)
            </p>
            <p className="text-sm text-blue-800">
              Vorschläge laufen ab jetzt mit privater, kollusionsresistenter Abstimmung
              auf Base Mainnet. Sobald du diesen Vorschlag einreichst, wird automatisch
              eine eigene MACI-Abstimmung erzeugt — Bürger:innen stimmen verschlüsselt ab
              und nur das aggregierte Endergebnis erscheint öffentlich auf der Blockchain.
            </p>
            <p className="text-sm text-blue-800">
              Deine Beschreibung wird dauerhaft auf Irys (Arweave) gespeichert.
            </p>
          </div>

          {pollInfo && uploadStage === "success" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="text-2xl leading-none">🔐</div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-emerald-900">
                    Verschlüsselte Abstimmung erfolgreich erzeugt
                  </p>
                  <p className="text-sm text-emerald-800">
                    Bürger:innen können in der mobilen App ab sofort verschlüsselt
                    abstimmen. Nach Ablauf der Frist veröffentlicht der Koordinator das
                    Ergebnis mit einem Zero-Knowledge-Beweis on-chain.
                  </p>
                  <dl className="text-xs text-emerald-900 space-y-1 font-mono">
                    <div className="flex gap-2">
                      <dt className="opacity-70 w-24">Proposal ID:</dt>
                      <dd className="break-all">{pollInfo.proposalId}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="opacity-70 w-24">MACI Poll ID:</dt>
                      <dd>{pollInfo.pollId}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="opacity-70 w-24">Poll:</dt>
                      <dd className="break-all">
                        <a href={`https://basescan.org/address/${pollInfo.pollAddress}`} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
                          {pollInfo.pollAddress}
                        </a>
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="opacity-70 w-24">Tally:</dt>
                      <dd className="break-all">
                        <a href={`https://basescan.org/address/${pollInfo.tallyAddress}`} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
                          {pollInfo.tallyAddress}
                        </a>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}

          <IrysBalanceCard />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
              {irysUrl && (
                <a
                  href={irysUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-red-600 underline mt-2 block hover:text-red-700"
                >
                  Hochgeladenen Inhalt ansehen →
                </a>
              )}
            </div>
          )}

          {uploadStage === "success" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800">
                ✅ {de.proposals.createProposalForm.proposalCreated}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-foreground mb-2">
              {de.proposals.createProposalForm.proposalTitle} *
            </label>
            <input
              id="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={de.proposals.createProposalForm.proposalTitlePlaceholder}
              disabled={isProcessing}
              className="w-full bg-card border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:border-black focus:ring-1 focus:ring-black disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-foreground mb-2">
              {de.proposals.createProposalForm.proposalDescription} *
            </label>
            <RichTextEditor
              content={description}
              onChange={setDescription}
              placeholder={de.proposals.createProposalForm.proposalDescriptionPlaceholder}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Nutze die Toolbar für Überschriften, Listen, Bilder und mehr
            </p>
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="text-lg font-medium mb-2 text-foreground">
              {de.proposals.createProposalForm.onChainActions}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Lasse diese Felder leer für einen reinen Text-Vorschlag
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="targetAddress" className="block text-sm font-medium text-foreground mb-2">
                  {de.proposals.createProposalForm.targetAddress}
                </label>
                <input
                  id="targetAddress"
                  type="text"
                  value={targetAddress}
                  onChange={(e) => setTargetAddress(e.target.value)}
                  placeholder={de.proposals.createProposalForm.targetAddressPlaceholder}
                  disabled={isProcessing}
                  className="w-full bg-card border border-border rounded-lg px-4 py-3 text-foreground font-mono text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="value" className="block text-sm font-medium text-foreground mb-2">
                  {de.proposals.createProposalForm.ethAmount}
                </label>
                <input
                  id="value"
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={de.proposals.createProposalForm.ethAmountPlaceholder}
                  disabled={isProcessing}
                  className="w-full bg-card border border-border rounded-lg px-4 py-3 text-foreground font-mono focus:outline-none focus:border-black focus:ring-1 focus:ring-black disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="calldata" className="block text-sm font-medium text-foreground mb-2">
                  {de.proposals.createProposalForm.calldata}
                </label>
                <input
                  id="calldata"
                  type="text"
                  value={calldata}
                  onChange={(e) => setCalldata(e.target.value)}
                  placeholder={de.proposals.createProposalForm.calldataPlaceholder}
                  disabled={isProcessing}
                  className="w-full bg-card border border-border rounded-lg px-4 py-3 text-foreground font-mono text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {uploadStage !== "idle" && uploadStage !== "error" && (
            <div className="bg-muted border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <div className="flex-1">
                  <p className="font-medium text-sm text-foreground">{getButtonText()}</p>
                  {uploadStage === "uploading" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Lade deinen Vorschlag zu permanentem Speicher hoch...
                    </p>
                  )}
                  {uploadStage === "submitting" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {de.common.waitingForSignature}
                    </p>
                  )}
                  {uploadStage === "confirming" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Warte auf Blockchain-Bestätigung...
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-muted border border-border rounded-lg p-4">
            <h4 className="font-medium mb-2 text-foreground">Zeitplan</h4>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>• Abstimmungsverzögerung: Durch Governance-Parameter festgelegt</p>
              <p>• Abstimmungsdauer: Durch Governance-Parameter festgelegt</p>
              <p>• Nach Abstimmungsende können erfolgreiche Vorschläge ausgeführt werden</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-6 md:pt-8 border-t border-border">
            <button
              type="submit"
              disabled={isProcessing || !title || !description.trim()}
              className={`flex-1 h-12 text-base font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                uploadStage === "success"
                  ? "bg-green-600 hover:bg-green-700"
                  : uploadStage === "error"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-black hover:bg-foreground/90"
              } disabled:bg-muted disabled:cursor-not-allowed text-white`}
            >
              {isProcessing && (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {getButtonText()}
            </button>
            <Link
              href={cancelHref}
              className="flex-1 h-12 text-base font-medium rounded-lg bg-transparent border border-border hover:bg-accent text-foreground transition-colors flex items-center justify-center"
            >
              {de.common.cancel}
            </Link>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            * Dein Vorschlag wird dauerhaft auf Irys gespeichert und on-chain referenziert
          </p>
        </form>
      )}
    </div>
  );
}
