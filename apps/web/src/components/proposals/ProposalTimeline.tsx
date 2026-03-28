"use client";

import { useState, useEffect } from "react";
import type { Proposal } from "@/lib/proposal-types";
import { useReadContract } from "thirdweb/react";
import { governorContract } from "@/lib/contracts";
import { ProposalCountdown } from "./ProposalCountdown";
import { eth_blockNumber } from "thirdweb/rpc";
import { getRpcClient } from "thirdweb/rpc";
import { base } from "thirdweb/chains";
import { client } from "@/app/client";

interface ProposalTimelineProps {
  proposal: Proposal;
}

const BASE_BLOCK_TIME = 2; // 2 seconds per block on Base

export function ProposalTimeline({ proposal }: ProposalTimelineProps) {
  const [currentBlock, setCurrentBlock] = useState<bigint>(BigInt(0));
  const blockchainProposalId = proposal?.blockchain_proposal_id;

  // Fetch governance parameters
  const { data: votingDelay } = useReadContract({
    contract: governorContract,
    method: "function votingDelay() view returns (uint256)",
    params: [],
  });

  const { data: votingPeriod } = useReadContract({
    contract: governorContract,
    method: "function votingPeriod() view returns (uint256)",
    params: [],
  });

  // Get proposal snapshot (creation block)
  const { data: proposalSnapshot } = useReadContract({
    contract: governorContract,
    method: "function proposalSnapshot(uint256 proposalId) view returns (uint256)",
    params: blockchainProposalId ? [BigInt(blockchainProposalId)] : [BigInt(0)],
    queryOptions: { enabled: !!blockchainProposalId },
  });

  // Get proposal deadline
  const { data: proposalDeadline } = useReadContract({
    contract: governorContract,
    method: "function proposalDeadline(uint256 proposalId) view returns (uint256)",
    params: blockchainProposalId ? [BigInt(blockchainProposalId)] : [BigInt(0)],
    queryOptions: { enabled: !!blockchainProposalId },
  });

  // Get current block number
  useEffect(() => {
    const fetchCurrentBlock = async () => {
      try {
        const rpcRequest = getRpcClient({ client, chain: base });
        const block = await eth_blockNumber(rpcRequest);
        setCurrentBlock(block);
      } catch (error) {
        console.error("Failed to fetch current block:", error);
      }
    };

    fetchCurrentBlock();
    const interval = setInterval(fetchCurrentBlock, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const blockToTimestamp = (blockNumber: bigint): Date => {
    const blockDiff = blockNumber - currentBlock;
    const secondsDiff = Number(blockDiff) * BASE_BLOCK_TIME;
    return new Date(Date.now() + secondsDiff * 1000);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("de-DE", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Calculate timeline events
  const createdDate = new Date(proposal.created_at);
  const votingStartBlock = proposalSnapshot ? proposalSnapshot + (votingDelay || BigInt(0)) : BigInt(0);
  const votingEndBlock = proposalDeadline || BigInt(0);

  const votingStartDate = proposalSnapshot && votingDelay ? blockToTimestamp(votingStartBlock) : createdDate;
  const votingEndDate = proposalDeadline ? blockToTimestamp(votingEndBlock) : new Date(createdDate.getTime() + 5 * 24 * 60 * 60 * 1000);

  // Determine current phase
  const isPending = currentBlock < votingStartBlock;
  const isActive = currentBlock >= votingStartBlock && currentBlock <= votingEndBlock;
  const isEnded = currentBlock > votingEndBlock;

  return (
    <div className="space-y-6">
      {/* Countdown Component */}
      {currentBlock > BigInt(0) && (
        <>
          {isPending && proposalSnapshot && votingDelay && (
            <ProposalCountdown
              targetBlock={votingStartBlock}
              currentBlock={currentBlock}
              label="Voting starts in"
              isPending={true}
            />
          )}
          {isActive && proposalDeadline && (
            <ProposalCountdown
              targetBlock={votingEndBlock}
              currentBlock={currentBlock}
              label="Voting ends in"
              isPending={false}
            />
          )}
        </>
      )}

      {/* Timeline */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-lg font-medium text-foreground">TIMELINE</h2>
        </div>

        <div className="space-y-6">
          {/* Created */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 bg-black rounded-full" />
              <div className="w-0.5 h-full bg-muted mt-2" />
            </div>
            <div className="flex-1 pb-2">
              <div className="font-medium text-foreground mb-1">Created</div>
              <div className="text-sm text-muted-foreground">{formatDate(createdDate)}</div>
              {proposalSnapshot && (
                <div className="text-xs text-muted-foreground mt-1">Block #{proposalSnapshot.toString()}</div>
              )}
            </div>
          </div>

          {/* Voting Start */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${isActive || isEnded ? 'bg-black' : 'bg-yellow-500'}`} />
              <div className="w-0.5 h-full bg-muted mt-2" />
            </div>
            <div className="flex-1 pb-2">
              <div className={`font-medium mb-1 ${isActive || isEnded ? 'text-foreground' : 'text-yellow-600'}`}>
                Voting Start {isPending && "⏳"}
              </div>
              <div className="text-sm text-muted-foreground">{formatDate(votingStartDate)}</div>
              {votingDelay && (
                <div className="text-xs text-muted-foreground mt-1">
                  Delay: {votingDelay.toString()} blocks (~{Number(votingDelay) * BASE_BLOCK_TIME / 3600} hours)
                </div>
              )}
            </div>
          </div>

          {/* Voting End */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${isEnded ? 'bg-black' : 'bg-muted'}`} />
            </div>
            <div className="flex-1">
              <div className={`font-medium mb-1 ${isEnded ? 'text-foreground' : 'text-muted-foreground'}`}>
                Voting End {isActive && "🗳️"}
              </div>
              <div className={`text-sm ${isEnded ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                {formatDate(votingEndDate)}
              </div>
              {votingPeriod && (
                <div className="text-xs text-muted-foreground mt-1">
                  Period: {votingPeriod.toString()} blocks (~{Number(votingPeriod) * BASE_BLOCK_TIME / 86400} days)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Governance Parameters Info */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="text-xs text-muted-foreground space-y-1">
            <div>Current Block: #{currentBlock.toString()}</div>
            {votingDelay && (
              <div>Voting Delay: {votingDelay.toString()} blocks (1 day)</div>
            )}
            {votingPeriod && (
              <div>Voting Period: {votingPeriod.toString()} blocks (5 days)</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
