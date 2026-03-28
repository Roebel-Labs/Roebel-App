"use client";

import { useState, useEffect } from "react";
import { useActiveAccount, ConnectButton } from "thirdweb/react";
import { getContract, prepareContractCall, sendTransaction, readContract } from "thirdweb";
import { client } from "@/app/client";
import { CONTRACTS, NETWORK } from "@/lib/semaphore-config";
import { UserPlus, Users, Loader2, CheckCircle, AlertCircle, Shield } from "lucide-react";
import Link from "next/link";
import { createWallet } from "thirdweb/wallets";

// Configure wallets for admin - including MetaMask, Coinbase, WalletConnect
const wallets = [
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("walletConnect"),
];

export default function AdminCitizensPage() {
  const account = useActiveAccount();
  const [loading, setLoading] = useState(false);
  const [totalCitizens, setTotalCitizens] = useState(0);
  const [groupRoot, setGroupRoot] = useState("");

  // Single citizen form
  const [singleCommitment, setSingleCommitment] = useState("");
  const [singleAddress, setSingleAddress] = useState("");

  // Batch form
  const [batchCommitments, setBatchCommitments] = useState("");

  // Status
  const [status, setStatus] = useState<{
    type: "success" | "error" | "info" | null;
    message: string;
  }>({ type: null, message: "" });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const registryContract = getContract({
        client,
        address: CONTRACTS.CITIZEN_REGISTRY,
        chain: NETWORK,
      });

      const [count, root] = await Promise.all([
        readContract({
          contract: registryContract,
          method: "function citizenCount() view returns (uint256)",
          params: [],
        }),
        readContract({
          contract: registryContract,
          method: "function getGroupRoot() view returns (uint256)",
          params: [],
        }),
      ]);

      setTotalCitizens(Number(count));
      setGroupRoot(`0x${root.toString(16)}`);
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const addSingleCitizen = async () => {
    if (!account) {
      setStatus({ type: "error", message: "Please connect your wallet" });
      return;
    }

    if (!singleCommitment || !singleAddress) {
      setStatus({ type: "error", message: "Please fill in all fields" });
      return;
    }

    setLoading(true);
    setStatus({ type: "info", message: "Adding citizen..." });

    try {
      const registryContract = getContract({
        client,
        address: CONTRACTS.CITIZEN_REGISTRY,
        chain: NETWORK,
      });

      const transaction = prepareContractCall({
        contract: registryContract,
        method: "function addCitizen(uint256, address)",
        params: [BigInt(singleCommitment), singleAddress as `0x${string}`],
      });

      const { transactionHash } = await sendTransaction({
        transaction,
        account,
      });

      setStatus({
        type: "success",
        message: `✅ Citizen added successfully! Tx: ${transactionHash}`,
      });

      // Clear form
      setSingleCommitment("");
      setSingleAddress("");

      // Reload stats
      await loadStats();
    } catch (error: any) {
      console.error("Error adding citizen:", error);
      setStatus({
        type: "error",
        message: `Failed to add citizen: ${error.message || "Unknown error"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const addBatchCitizens = async () => {
    if (!account) {
      setStatus({ type: "error", message: "Please connect your wallet" });
      return;
    }

    if (!batchCommitments.trim()) {
      setStatus({ type: "error", message: "Please enter commitments" });
      return;
    }

    setLoading(true);
    setStatus({ type: "info", message: "Adding citizens in batch..." });

    try {
      // Parse commitments (one per line or comma-separated)
      const commitments = batchCommitments
        .split(/[\n,]/)
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
        .map((c) => BigInt(c));

      if (commitments.length === 0) {
        setStatus({ type: "error", message: "No valid commitments found" });
        setLoading(false);
        return;
      }

      if (commitments.length > 100) {
        setStatus({ type: "error", message: "Maximum 100 citizens per batch" });
        setLoading(false);
        return;
      }

      const registryContract = getContract({
        client,
        address: CONTRACTS.CITIZEN_REGISTRY,
        chain: NETWORK,
      });

      const transaction = prepareContractCall({
        contract: registryContract,
        method: "function addCitizensBatch(uint256[])",
        params: [commitments],
      });

      const { transactionHash } = await sendTransaction({
        transaction,
        account,
      });

      setStatus({
        type: "success",
        message: `✅ ${commitments.length} citizens added successfully! Tx: ${transactionHash}`,
      });

      // Clear form
      setBatchCommitments("");

      // Reload stats
      await loadStats();
    } catch (error: any) {
      console.error("Error adding citizens:", error);
      setStatus({
        type: "error",
        message: `Failed to add citizens: ${error.message || "Unknown error"}`,
      });
    } finally {
      setLoading(false);
    }
  };

  // Check if user is admin (basic check - you can enhance this)
  const isAdmin = account?.address !== undefined;

  if (!account) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-8">
        <div className="bg-card rounded-2xl shadow-xl p-8 max-w-md text-center">
          <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-medium mb-4">Admin Access Required</h2>
          <p className="text-muted-foreground mb-6">Please connect your wallet to access admin functions.</p>
          <ConnectButton
            client={client}
            wallets={wallets}
            theme="light"
            connectButton={{
              label: "Connect Wallet",
            }}
            connectModal={{
              size: "wide",
              title: "Admin Login",
              welcomeScreen: {
                title: "Manage Citizens",
                subtitle: "Connect your admin wallet to add verified citizens",
              },
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Link href="/semaphore" className="text-primary hover:text-primary/80 inline-block">
              ← Back to Home
            </Link>
            <ConnectButton
              client={client}
              wallets={wallets}
              theme="light"
              connectButton={{
                label: "Connect Wallet",
              }}
            />
          </div>
          <h1 className="text-4xl font-medium text-foreground mb-2">Manage Citizens</h1>
          <p className="text-muted-foreground">Add verified citizens to the registry on-chain</p>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-card rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Registered Citizens</p>
                <p className="text-4xl font-medium text-foreground">{totalCitizens}</p>
              </div>
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="w-8 h-8 text-primary" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Group Merkle Root</p>
                <p className="text-xs font-mono text-foreground break-all">{groupRoot || "Loading..."}</p>
              </div>
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 ml-4">
                <Shield className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Status Message */}
        {status.type && (
          <div
            className={`mb-8 p-4 rounded-lg flex items-start space-x-3 ${
              status.type === "success"
                ? "bg-green-50 border border-green-200"
                : status.type === "error"
                ? "bg-red-50 border border-red-200"
                : "bg-blue-50 border border-blue-200"
            }`}
          >
            {status.type === "success" && <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />}
            {status.type === "error" && <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />}
            {status.type === "info" && <Loader2 className="w-6 h-6 text-primary flex-shrink-0 animate-spin" />}
            <p
              className={`text-sm ${
                status.type === "success"
                  ? "text-green-800"
                  : status.type === "error"
                  ? "text-red-800"
                  : "text-blue-800"
              }`}
            >
              {status.message}
            </p>
          </div>
        )}

        {/* Add Single Citizen */}
        <div className="bg-card rounded-2xl shadow-xl p-8 mb-8">
          <div className="flex items-center space-x-3 mb-6">
            <UserPlus className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-medium text-foreground">Add Single Citizen</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Identity Commitment
              </label>
              <input
                type="text"
                value={singleCommitment}
                onChange={(e) => setSingleCommitment(e.target.value)}
                placeholder="Paste the citizen's identity commitment here"
                className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The citizen&apos;s public identity commitment (big number)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Citizen Address (Optional)
              </label>
              <input
                type="text"
                value={singleAddress}
                onChange={(e) => setSingleAddress(e.target.value)}
                placeholder="0x... (optional, for tracking)"
                className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The citizen&apos;s wallet address (for tracking purposes, optional)
              </p>
            </div>

            <button
              onClick={addSingleCitizen}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Adding Citizen...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  <span>Add Citizen</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Add Batch Citizens */}
        <div className="bg-card rounded-2xl shadow-xl p-8">
          <div className="flex items-center space-x-3 mb-6">
            <Users className="w-6 h-6 text-purple-600" />
            <h2 className="text-2xl font-medium text-foreground">Add Multiple Citizens (Batch)</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Identity Commitments (One per line or comma-separated)
              </label>
              <textarea
                value={batchCommitments}
                onChange={(e) => setBatchCommitments(e.target.value)}
                placeholder="Paste multiple commitments here:
123456789...
987654321...
or comma-separated: 123456789..., 987654321..."
                rows={8}
                className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum 100 citizens per batch. Gas efficient for multiple additions.
              </p>
            </div>

            <button
              onClick={addBatchCitizens}
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Adding Citizens...</span>
                </>
              ) : (
                <>
                  <Users className="w-5 h-5" />
                  <span>Add Citizens (Batch)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">📝 Instructions</h3>
          <ol className="list-decimal list-inside space-y-2 text-blue-800 text-sm">
            <li>Verify the citizen&apos;s identity off-chain (ID, utility bill, etc.)</li>
            <li>Have the citizen generate their Semaphore identity at /semaphore/identity</li>
            <li>Citizen shares their identity commitment with you</li>
            <li>Paste the commitment here and add them to the registry</li>
            <li>Citizen can then verify their status at /semaphore/status</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
