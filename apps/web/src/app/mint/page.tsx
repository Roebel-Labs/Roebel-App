"use client";

export const dynamic = "force-dynamic";

import { Header } from "@/components/layout/Header";
import { useActiveAccount, useReadContract, useSendTransaction } from "thirdweb/react";
import { nftContract } from "@/lib/contracts";
import { balanceOf, nextTokenIdToMint } from "thirdweb/extensions/erc721";
import { prepareContractCall } from "thirdweb";
import { useState } from "react";
import Link from "next/link";

export default function MintPage() {
  const account = useActiveAccount();
  const [isMinting, setIsMinting] = useState(false);

  const { mutate: sendTransaction, isPending } = useSendTransaction();

  const { data: nftBalance, refetch: refetchBalance } = useReadContract(balanceOf, {
    contract: nftContract,
    owner: account?.address || "",
    queryOptions: { enabled: !!account },
  });

  const { data: nextTokenId } = useReadContract(nextTokenIdToMint, {
    contract: nftContract,
  });

  const hasNFT = nftBalance !== undefined && nftBalance > 0n;

  const handleMint = async () => {
    if (!account) return;

    setIsMinting(true);

    const transaction = prepareContractCall({
      contract: nftContract,
      method: "function safeMint(address to) public",
      params: [account.address],
    });

    sendTransaction(transaction, {
      onSuccess: () => {
        setTimeout(() => {
          refetchBalance();
          setIsMinting(false);
        }, 2000);
      },
      onError: (error) => {
        console.error("Minting failed:", error);
        setIsMinting(false);
      },
    });
  };

  return (
    <div className="min-h-screen bg-muted">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              ← Back to Dashboard
            </Link>
          </div>

          <div className="bg-card border border-border rounded-xl shadow-sm p-4 md:p-8 lg:p-12">
            <h1 className="text-3xl font-medium mb-2 text-foreground">Mint Membership NFT</h1>
            <p className="text-muted-foreground mb-8">Join the DAO and participate in governance</p>

            {!account ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  Connect your wallet to mint an NFT
                </p>
              </div>
            ) : hasNFT ? (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-medium text-green-900">
                      You Already Own an NFT!
                    </h2>
                  </div>
                  <p className="text-green-800 mb-4">
                    You own {nftBalance?.toString()} HomeTown DAO NFT(s) and can participate in governance.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Link
                      href="/delegate"
                      className="inline-flex items-center justify-center bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                    >
                      Delegate Voting Power
                    </Link>
                    <Link
                      href="/proposals"
                      className="inline-flex items-center justify-center bg-card hover:bg-accent text-green-700 border border-green-200 px-6 py-3 rounded-lg transition-colors font-medium"
                    >
                      View Proposals
                    </Link>
                  </div>
                </div>

                <div className="border-t border-border pt-6">
                  <h3 className="text-lg font-medium mb-3 text-foreground">Your NFT Details</h3>
                  <div className="bg-muted border border-border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Balance:</span>
                      <span className="font-mono text-foreground">{nftBalance?.toString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Contract:</span>
                      <span className="font-mono text-sm text-foreground">
                        {nftContract.address.slice(0, 6)}...{nftContract.address.slice(-4)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h2 className="text-xl font-medium mb-2 text-blue-900">
                    Become a DAO Member
                  </h2>
                  <p className="text-blue-800">
                    Mint your HomeTown DAO NFT to participate in community governance.
                    Each NFT represents one vote in the DAO.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-foreground">What You Get</h3>
                  <ul className="space-y-3 text-foreground">
                    <li className="flex items-start gap-3">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <span>One vote per NFT in all governance proposals</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <span>Ability to create new proposals</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <span>Delegate voting power to trusted members</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <span>Help shape the future of our community</span>
                    </li>
                  </ul>
                </div>

                <div className="border-t border-border pt-6">
                  <div className="bg-muted border border-border rounded-lg p-4 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Next Token ID:</span>
                      <span className="font-mono text-foreground">#{nextTokenId?.toString() || "..."}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleMint}
                    disabled={isPending || isMinting}
                    className="w-full bg-black hover:bg-foreground/90 disabled:bg-muted disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors h-12 text-base"
                  >
                    {isPending || isMinting ? "Minting..." : "Mint NFT"}
                  </button>

                  <p className="text-sm text-muted-foreground mt-4 text-center">
                    After minting, remember to delegate your voting power
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
