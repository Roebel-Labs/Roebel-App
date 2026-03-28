import { useState, useEffect } from "react";
import { getContract } from "thirdweb";
import { base } from "thirdweb/chains";
import { client } from "@/app/client";
import { VERIFICATION_CONTRACTS } from "@/lib/verification-contracts";

export interface GraphNode {
  id: string;
  address: string;
  type: "attester" | "citizen"; // attester = has AttesterNFT (also has CitizenNFT), citizen = only CitizenNFT
  isFounder: boolean;
  mintedAt?: number;
  verifiedBy?: string[]; // Addresses of those who approved
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: "attester_approved" | "citizen_approved";
  timestamp: number;
}

export interface SocialGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function useSocialGraph(): SocialGraphData {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchGraphData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Dynamic import to avoid SSR issues
        const { getContractEvents, prepareEvent } = await import("thirdweb");

        // Initialize contracts
        const attesterContract = getContract({
          client,
          chain: base,
          address: VERIFICATION_CONTRACTS.attesterNFT,
        });

        const citizenContract = getContract({
          client,
          chain: base,
          address: VERIFICATION_CONTRACTS.citizenNFT,
        });

        // Prepare Transfer event
        const transferEvent = prepareEvent({
          signature: "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
        });

        // Fetch Attester NFT mints
        const attesterMints = await getContractEvents({
          contract: attesterContract,
          events: [transferEvent],
        });

        // Fetch Citizen NFT mints
        const citizenMints = await getContractEvents({
          contract: citizenContract,
          events: [transferEvent],
        });

        // Build nodes map
        const nodesMap = new Map<string, GraphNode>();
        const attesterAddresses = new Set<string>();

        // First pass: collect all Attester addresses
        attesterMints
          .filter((event: any) => event.args?.from === "0x0000000000000000000000000000000000000000")
          .forEach((event: any) => {
            const address = event.args?.to as string;
            if (address) {
              attesterAddresses.add(address);
            }
          });

        // Second pass: Process Attester mints
        // All Attesters are also Citizens, so they get "attester" type
        attesterMints
          .filter((event: any) => event.args?.from === "0x0000000000000000000000000000000000000000")
          .forEach((event: any, index: number) => {
            const address = event.args?.to as string;
            if (address) {
              nodesMap.set(address, {
                id: address,
                address,
                type: "attester", // All Attesters are committee members (also have Citizen rights)
                isFounder: index < 3, // First 3 are founders
                mintedAt: event.blockNumber,
              });
            }
          });

        // Third pass: Process Citizen-only mints
        // Only add if they don't already have Attester NFT
        citizenMints
          .filter((event: any) => event.args?.from === "0x0000000000000000000000000000000000000000")
          .forEach((event: any, index: number) => {
            const address = event.args?.to as string;
            if (address && !attesterAddresses.has(address)) {
              nodesMap.set(address, {
                id: address,
                address,
                type: "citizen", // Citizen-only (not a committee member)
                isFounder: index < 3, // First 3 are founders
                mintedAt: event.blockNumber,
              });
            }
          });

        // Prepare RequestApproved events
        const attesterApprovedEvent = prepareEvent({
          signature: "event RequestApproved(uint256 indexed requestId, address indexed approver)",
        });

        const citizenApprovedEvent = prepareEvent({
          signature: "event RequestApproved(uint256 indexed requestId, address indexed approver, bool isAttester, bool isCitizen, bool signedAsAttester)",
        });

        const attesterMintedEvent = prepareEvent({
          signature: "event AttesterNFTMinted(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId)",
        });

        const citizenMintedEvent = prepareEvent({
          signature: "event CitizenNFTMinted(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId)",
        });

        // Fetch approval events
        const [attesterApprovals, citizenApprovals, attesterMintEvents, citizenMintEvents] = await Promise.all([
          getContractEvents({
            contract: attesterContract,
            events: [attesterApprovedEvent],
          }),
          getContractEvents({
            contract: citizenContract,
            events: [citizenApprovedEvent],
          }),
          getContractEvents({
            contract: attesterContract,
            events: [attesterMintedEvent],
          }),
          getContractEvents({
            contract: citizenContract,
            events: [citizenMintedEvent],
          }),
        ]);

        // Build edges from approvals
        const edgesArray: GraphEdge[] = [];
        const edgeSet = new Set<string>(); // To avoid duplicates

        // Map requestId to target address for Attester approvals
        const attesterRequestToTarget = new Map<string, string>();
        attesterMintEvents.forEach((event: any) => {
          const requestId = event.args?.requestId?.toString();
          const target = event.args?.attester as string;
          if (requestId && target) {
            attesterRequestToTarget.set(requestId, target);
          }
        });

        // Map requestId to target address for Citizen approvals
        const citizenRequestToTarget = new Map<string, string>();
        citizenMintEvents.forEach((event: any) => {
          const requestId = event.args?.requestId?.toString();
          const target = event.args?.citizen as string;
          if (requestId && target) {
            citizenRequestToTarget.set(requestId, target);
          }
        });

        // Process Attester approvals
        attesterApprovals.forEach((event: any) => {
          const requestId = event.args?.requestId?.toString();
          const approver = event.args?.approver as string;
          const target = attesterRequestToTarget.get(requestId);

          if (approver && target && approver !== target) {
            const edgeId = `${approver}->${target}`;
            if (!edgeSet.has(edgeId)) {
              edgesArray.push({
                id: edgeId,
                source: approver,
                target: target,
                type: "attester_approved",
                timestamp: event.blockNumber || 0,
              });
              edgeSet.add(edgeId);
            }

            // Update node verifiedBy
            const targetNode = nodesMap.get(target);
            if (targetNode) {
              if (!targetNode.verifiedBy) {
                targetNode.verifiedBy = [];
              }
              if (!targetNode.verifiedBy.includes(approver)) {
                targetNode.verifiedBy.push(approver);
              }
            }
          }
        });

        // Process Citizen approvals
        citizenApprovals.forEach((event: any) => {
          const requestId = event.args?.requestId?.toString();
          const approver = event.args?.approver as string;
          const target = citizenRequestToTarget.get(requestId);

          if (approver && target && approver !== target) {
            const edgeId = `${approver}->${target}`;
            if (!edgeSet.has(edgeId)) {
              edgesArray.push({
                id: edgeId,
                source: approver,
                target: target,
                type: "citizen_approved",
                timestamp: event.blockNumber || 0,
              });
              edgeSet.add(edgeId);
            }

            // Update node verifiedBy
            const targetNode = nodesMap.get(target);
            if (targetNode) {
              if (!targetNode.verifiedBy) {
                targetNode.verifiedBy = [];
              }
              if (!targetNode.verifiedBy.includes(approver)) {
                targetNode.verifiedBy.push(approver);
              }
            }
          }
        });

        setNodes(Array.from(nodesMap.values()));
        setEdges(edgesArray);
        setLastUpdated(new Date());
        setIsLoading(false);
      } catch (err) {
        console.error("Error fetching social graph data:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setIsLoading(false);
      }
    };

  useEffect(() => {
    // Fetch data only on mount (page refresh)
    fetchGraphData();
  }, []);

  const refresh = () => {
    fetchGraphData();
  };

  return { nodes, edges, isLoading, error, lastUpdated, refresh };
}
