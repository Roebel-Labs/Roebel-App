import { useEffect, useRef, useState } from "react";
import { getContract } from "thirdweb";
import { gnosis } from "@/lib/gnosis";
import { base } from "thirdweb/chains";
import { client } from "@/app/client";
import { VERIFICATION_CONTRACTS } from "@/lib/verification-contracts";

export type NodeStatus = "active" | "pending" | "revoked";

export interface GraphNode {
  id: string;
  address: string;
  type: "attester" | "citizen";
  isFounder: boolean;
  status: NodeStatus;
  mintedAt?: number;
  revokedAt?: number;
  requestedAt?: number;
  requestId?: string;
  verifiedBy?: string[];
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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
// CitizenNFTv2/AttesterNFTv2 deployed on Gnosis ~block 46867700 (2026-06-25). Without a
// fromBlock, thirdweb's default getContractEvents range misses the migration-mint block,
// so the graph comes back empty ("Noch keine verifizierten Bürger"). toBlock = latest.
const FROM_BLOCK = 46867000n;
// The Gnosis migration bulk-minted citizens (no RequestApproved events), so the
// "who verified whom" edges live only on the prior Base contracts. We overlay them
// onto the current Gnosis nodes (the same wallet addresses across both chains).
const BASE_CITIZEN_NFT = "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB";
const BASE_ATTESTER_NFT = "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb";
const BASE_FROM_BLOCK = 47000000n;

export function useSocialGraph(): SocialGraphData {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const fetchGraphData = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setError(null);

      const { getContractEvents, prepareEvent } = await import("thirdweb");

      const attesterContract = getContract({
        client,
        chain: gnosis,
        address: VERIFICATION_CONTRACTS.attesterNFT,
      });

      const citizenContract = getContract({
        client,
        chain: gnosis,
        address: VERIFICATION_CONTRACTS.citizenNFT,
      });

      const transferEvent = prepareEvent({
        signature:
          "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
      });

      const attesterApprovedEvent = prepareEvent({
        signature:
          "event RequestApproved(uint256 indexed requestId, address indexed approver)",
      });

      const citizenApprovedEvent = prepareEvent({
        // v2 (Gnosis): dropped isAttester/isCitizen booleans, kept signedAsAttester
        signature:
          "event RequestApproved(uint256 indexed requestId, address indexed approver, bool signedAsAttester)",
      });

      const attesterMintedEvent = prepareEvent({
        signature:
          "event AttesterNFTMinted(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId)",
      });

      const citizenMintedEvent = prepareEvent({
        signature:
          "event CitizenNFTMinted(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId)",
      });

      const attestationRequestEvent = prepareEvent({
        signature:
          "event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)",
      });

      const attesterRevokedEvent = prepareEvent({
        signature:
          "event AttesterNFTRevoked(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId)",
      });

      const citizenRevokedEvent = prepareEvent({
        signature:
          "event CitizenNFTRevoked(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId)",
      });

      // Prior Base contracts — source of the historical "who verified whom" edges.
      const baseAttesterContract = getContract({ client, chain: base, address: BASE_ATTESTER_NFT });
      const baseCitizenContract = getContract({ client, chain: base, address: BASE_CITIZEN_NFT });
      const baseAttesterApprovedEvent = prepareEvent({
        signature: "event RequestApproved(uint256 indexed requestId, address indexed approver)",
      });
      const baseCitizenApprovedEvent = prepareEvent({
        // v1 (Base) CitizenNFT carried isAttester/isCitizen booleans on RequestApproved.
        signature:
          "event RequestApproved(uint256 indexed requestId, address indexed approver, bool isAttester, bool isCitizen, bool signedAsAttester)",
      });

      const [
        attesterMints,
        citizenMints,
        attesterApprovals,
        citizenApprovals,
        attesterMintEvents,
        citizenMintEvents,
        attesterRequests,
        citizenRequests,
        attesterRevocations,
        citizenRevocations,
        baseAttesterApprovals,
        baseCitizenApprovals,
        baseAttesterMintEvents,
        baseCitizenMintEvents,
      ] = await Promise.all([
        getContractEvents({ contract: attesterContract, events: [transferEvent], fromBlock: FROM_BLOCK }),
        getContractEvents({ contract: citizenContract, events: [transferEvent], fromBlock: FROM_BLOCK }),
        getContractEvents({ contract: attesterContract, events: [attesterApprovedEvent], fromBlock: FROM_BLOCK }),
        getContractEvents({ contract: citizenContract, events: [citizenApprovedEvent], fromBlock: FROM_BLOCK }),
        getContractEvents({ contract: attesterContract, events: [attesterMintedEvent], fromBlock: FROM_BLOCK }),
        getContractEvents({ contract: citizenContract, events: [citizenMintedEvent], fromBlock: FROM_BLOCK }),
        getContractEvents({ contract: attesterContract, events: [attestationRequestEvent], fromBlock: FROM_BLOCK }),
        getContractEvents({ contract: citizenContract, events: [attestationRequestEvent], fromBlock: FROM_BLOCK }),
        getContractEvents({ contract: attesterContract, events: [attesterRevokedEvent], fromBlock: FROM_BLOCK }),
        getContractEvents({ contract: citizenContract, events: [citizenRevokedEvent], fromBlock: FROM_BLOCK }),
        // Base (historical approval edges) — fail-soft so the graph still renders if Base RPC errors.
        getContractEvents({ contract: baseAttesterContract, events: [baseAttesterApprovedEvent], fromBlock: BASE_FROM_BLOCK }).catch(() => []),
        getContractEvents({ contract: baseCitizenContract, events: [baseCitizenApprovedEvent], fromBlock: BASE_FROM_BLOCK }).catch(() => []),
        getContractEvents({ contract: baseAttesterContract, events: [attesterMintedEvent], fromBlock: BASE_FROM_BLOCK }).catch(() => []),
        getContractEvents({ contract: baseCitizenContract, events: [citizenMintedEvent], fromBlock: BASE_FROM_BLOCK }).catch(() => []),
      ]);

      const nodesMap = new Map<string, GraphNode>();
      const attesterAddresses = new Set<string>();

      // Pass 1: collect attester mint targets
      attesterMints
        .filter((event: any) => event.args?.from === ZERO_ADDRESS)
        .forEach((event: any) => {
          const address = event.args?.to as string;
          if (address) attesterAddresses.add(address);
        });

      // Pass 2: attester mints → active attester nodes (first 3 = founders)
      attesterMints
        .filter((event: any) => event.args?.from === ZERO_ADDRESS)
        .forEach((event: any, index: number) => {
          const address = event.args?.to as string;
          if (!address) return;
          nodesMap.set(address, {
            id: address,
            address,
            type: "attester",
            isFounder: index < 3,
            status: "active",
            mintedAt: event.blockNumber,
          });
        });

      // Pass 3: citizen-only mints → active citizen nodes
      citizenMints
        .filter((event: any) => event.args?.from === ZERO_ADDRESS)
        .forEach((event: any, index: number) => {
          const address = event.args?.to as string;
          if (!address || attesterAddresses.has(address)) return;
          nodesMap.set(address, {
            id: address,
            address,
            type: "citizen",
            isFounder: index < 3,
            status: "active",
            mintedAt: event.blockNumber,
          });
        });

      // Pass 4: pending citizen requests — only if target isn't already a member
      citizenRequests.forEach((event: any) => {
        const target = event.args?.target as string;
        const requestId = event.args?.requestId?.toString();
        if (!target || nodesMap.has(target)) return;
        nodesMap.set(target, {
          id: target,
          address: target,
          type: "citizen",
          isFounder: false,
          status: "pending",
          requestedAt: event.blockNumber,
          requestId,
        });
      });

      // Pass 5: pending attester requests — same rule
      attesterRequests.forEach((event: any) => {
        const target = event.args?.target as string;
        const requestId = event.args?.requestId?.toString();
        if (!target || nodesMap.has(target)) return;
        nodesMap.set(target, {
          id: target,
          address: target,
          type: "attester",
          isFounder: false,
          status: "pending",
          requestedAt: event.blockNumber,
          requestId,
        });
      });

      // Pass 6: revocations — mark existing nodes as revoked
      attesterRevocations.forEach((event: any) => {
        const address = event.args?.attester as string;
        if (!address) return;
        const node = nodesMap.get(address);
        if (!node) return;
        node.status = "revoked";
        node.revokedAt = event.blockNumber;
      });
      citizenRevocations.forEach((event: any) => {
        const address = event.args?.citizen as string;
        if (!address) return;
        const node = nodesMap.get(address);
        if (!node) return;
        node.status = "revoked";
        node.revokedAt = event.blockNumber;
      });

      // Build edges from approvals that match a successful mint requestId
      const edgesArray: GraphEdge[] = [];
      const edgeSet = new Set<string>();

      const attesterRequestToTarget = new Map<string, string>();
      attesterMintEvents.forEach((event: any) => {
        const requestId = event.args?.requestId?.toString();
        const target = event.args?.attester as string;
        if (requestId && target) attesterRequestToTarget.set(requestId, target);
      });

      const citizenRequestToTarget = new Map<string, string>();
      citizenMintEvents.forEach((event: any) => {
        const requestId = event.args?.requestId?.toString();
        const target = event.args?.citizen as string;
        if (requestId && target) citizenRequestToTarget.set(requestId, target);
      });

      attesterApprovals.forEach((event: any) => {
        const requestId = event.args?.requestId?.toString();
        const approver = event.args?.approver as string;
        const target = attesterRequestToTarget.get(requestId);
        if (!approver || !target || approver === target) return;

        const edgeId = `${approver}->${target}`;
        if (!edgeSet.has(edgeId)) {
          edgesArray.push({
            id: edgeId,
            source: approver,
            target,
            type: "attester_approved",
            timestamp: event.blockNumber || 0,
          });
          edgeSet.add(edgeId);
        }
        const targetNode = nodesMap.get(target);
        if (targetNode) {
          if (!targetNode.verifiedBy) targetNode.verifiedBy = [];
          if (!targetNode.verifiedBy.includes(approver)) {
            targetNode.verifiedBy.push(approver);
          }
        }
      });

      citizenApprovals.forEach((event: any) => {
        const requestId = event.args?.requestId?.toString();
        const approver = event.args?.approver as string;
        const target = citizenRequestToTarget.get(requestId);
        if (!approver || !target || approver === target) return;

        const edgeId = `${approver}->${target}`;
        if (!edgeSet.has(edgeId)) {
          edgesArray.push({
            id: edgeId,
            source: approver,
            target,
            type: "citizen_approved",
            timestamp: event.blockNumber || 0,
          });
          edgeSet.add(edgeId);
        }
        const targetNode = nodesMap.get(target);
        if (targetNode) {
          if (!targetNode.verifiedBy) targetNode.verifiedBy = [];
          if (!targetNode.verifiedBy.includes(approver)) {
            targetNode.verifiedBy.push(approver);
          }
        }
      });

      // Overlay the ORIGINAL verification edges from the prior Base contracts (the
      // Gnosis migration bulk-minted, so it has no approval events). Only connect
      // addresses that are current Gnosis members (same wallet address across chains).
      const baseAttesterReqToTarget = new Map<string, string>();
      (baseAttesterMintEvents as any[]).forEach((e: any) => {
        const rid = e.args?.requestId?.toString();
        const t = e.args?.attester as string;
        if (rid && t) baseAttesterReqToTarget.set(rid, t);
      });
      const baseCitizenReqToTarget = new Map<string, string>();
      (baseCitizenMintEvents as any[]).forEach((e: any) => {
        const rid = e.args?.requestId?.toString();
        const t = e.args?.citizen as string;
        if (rid && t) baseCitizenReqToTarget.set(rid, t);
      });
      const addHistoricalEdge = (
        approver: string | undefined,
        target: string | undefined,
        type: "attester_approved" | "citizen_approved",
      ) => {
        if (!approver || !target || approver === target) return;
        if (!nodesMap.has(approver) || !nodesMap.has(target)) return;
        const edgeId = `${approver}->${target}`;
        if (!edgeSet.has(edgeId)) {
          edgesArray.push({ id: edgeId, source: approver, target, type, timestamp: 0 });
          edgeSet.add(edgeId);
        }
        const tn = nodesMap.get(target);
        if (tn) {
          if (!tn.verifiedBy) tn.verifiedBy = [];
          if (!tn.verifiedBy.includes(approver)) tn.verifiedBy.push(approver);
        }
      };
      (baseAttesterApprovals as any[]).forEach((e: any) =>
        addHistoricalEdge(e.args?.approver as string, baseAttesterReqToTarget.get(e.args?.requestId?.toString()), "attester_approved"),
      );
      (baseCitizenApprovals as any[]).forEach((e: any) =>
        addHistoricalEdge(e.args?.approver as string, baseCitizenReqToTarget.get(e.args?.requestId?.toString()), "citizen_approved"),
      );

      setNodes(Array.from(nodesMap.values()));
      setEdges(edgesArray);
      setLastUpdated(new Date());
      setIsLoading(false);
    } catch (err) {
      console.error("Error fetching social graph data:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    fetchGraphData();
    const interval = setInterval(fetchGraphData, 30_000);
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchGraphData();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    nodes,
    edges,
    isLoading,
    error,
    lastUpdated,
    refresh: fetchGraphData,
  };
}
