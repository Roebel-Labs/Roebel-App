"use client";

export const dynamic = "force-dynamic";

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

export default function CreateProposalPage() {
  const account = useActiveAccount();
  const router = useRouter();
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [error, setError] = useState<string>("");
  const [irysUrl, setIrysUrl] = useState<string>("");

  const { mutate: sendTransaction, isPending } = useSendTransaction();
  const { isAttester, isLoading: statusLoading } = useVerificationStatus();

  const { data: nftBalance } = useReadContract(balanceOf, {
    contract: nftContract,
    owner: account?.address || "",
    queryOptions: { enabled: !!account },
  });

  const { data: currentDelegate } = useReadContract({
    contract: nftContract,
    method: "function delegates(address account) view returns (address)",
    params: [account?.address || "0x0"],
    queryOptions: { enabled: !!account },
  });

  const hasNFT = nftBalance !== undefined && nftBalance > 0n;
  const hasDelegated = currentDelegate && currentDelegate !== "0x0000000000000000000000000000000000000000";

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
              console.log("🔄 Redirecting to proposals list...");
              router.push("/app/proposals");
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
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <Link href="/app/proposals" className="text-muted-foreground hover:text-foreground transition-colors">
          {de.navigation.backToDashboard}
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-8 lg:p-12">
            <h1 className="text-2xl sm:text-3xl font-medium mb-2 text-foreground">{de.proposals.createProposalForm.title}</h1>
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
            ) : !hasDelegated ? (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-8 text-center">
                <div className="text-4xl mb-4">⚠️</div>
                <h2 className="text-xl font-medium text-yellow-900 mb-2">
                  Stimmrecht delegieren
                </h2>
                <p className="text-yellow-800 mb-6">
                  Du musst deine Stimmrechte delegieren, um Vorschläge zu erstellen
                </p>
                <Link
                  href="/delegate"
                  className="inline-block bg-black hover:bg-foreground/90 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                >
                  Jetzt delegieren →
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    Erstelle einen Vorschlag, über den die Community abstimmen kann. Deine Beschreibung wird dauerhaft auf Irys (Arweave) gespeichert.
                  </p>
                </div>

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
                    href="/app/proposals"
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
    </div>
  );
}
