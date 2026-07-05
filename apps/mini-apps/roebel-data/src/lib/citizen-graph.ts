// Citizen-verification graph — a viem port of the apps/web `useSocialGraph` hook.
// Reads the on-chain CitizenNFTv2 + AttesterNFTv2 events on Gnosis and builds a
// "who verified whom" graph (attester + citizen nodes, verification edges) plus the
// civic counts shown on the Gemeinde tab. Read-only, no wallet needed. Fail-soft:
// any RPC error falls back to nodes built from the static citizen snapshot so the
// graph never renders empty.
import { useEffect, useRef, useState } from "react";
import { createPublicClient, http, parseAbiItem } from "viem";
import { gnosis } from "viem/chains";
import { GNOSIS_RPC } from "./circles";
import { CITIZEN_NFT_V2, ATTESTER_NFT_V2 } from "./citizens-onchain";
import { ROEBEL_CITIZENS } from "./citizens";

export type CgStatus = "active" | "pending" | "revoked";
export interface CgNode {
  id: string;
  address: string;
  type: "attester" | "citizen";
  isFounder: boolean;
  status: CgStatus;
  verifiedBy?: string[];
}
export interface CgEdge {
  id: string;
  source: string;
  target: string;
  type: "attester_approved" | "citizen_approved";
}
export interface CgCounts {
  citizens: number; // active members (attester + citizen) = verified citizens
  attesters: number;
  verifications: number;
  pending: number;
  revoked: number;
}

const publicClient = createPublicClient({ chain: gnosis, transport: http(GNOSIS_RPC) });

// Both NFTs deployed ~Gnosis block 46867700 (2026-06-25). Scan from just below.
const DEPLOY_BLOCK = 46867700n;
// rpc.gnosischain.com rejects oversized getLogs ranges and rate-limits (-32016);
// walk the range in fixed windows with light retry/backoff (mirrors citizens-onchain).
const CHUNK = 100_000n;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const CITIZEN_MINTED = parseAbiItem(
  "event CitizenNFTMinted(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId)",
);
const ATTESTER_MINTED = parseAbiItem(
  "event AttesterNFTMinted(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId)",
);
// v2 (Gnosis) CitizenNFT: RequestApproved carries a single `signedAsAttester` bool.
const CITIZEN_APPROVED = parseAbiItem(
  "event RequestApproved(uint256 indexed requestId, address indexed approver, bool signedAsAttester)",
);
const ATTESTER_APPROVED = parseAbiItem("event RequestApproved(uint256 indexed requestId, address indexed approver)");
const REQUEST_CREATED = parseAbiItem(
  "event AttestationRequestCreated(uint256 indexed requestId, address indexed target, string evidenceURI)",
);
const CITIZEN_REVOKED = parseAbiItem(
  "event CitizenNFTRevoked(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId)",
);
const ATTESTER_REVOKED = parseAbiItem(
  "event AttesterNFTRevoked(address indexed attester, uint256 indexed tokenId, uint256 indexed requestId)",
);

type EvLog = { eventName?: string; args: Record<string, unknown> };
const norm = (a: unknown) => String(a ?? "").toLowerCase();

/** Scan one contract's events across the whole range, chunked with light backoff. */
async function scanContract(
  address: `0x${string}`,
  events: readonly unknown[],
  latest: bigint,
): Promise<EvLog[]> {
  const out: EvLog[] = [];
  for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    let attempt = 0;
    for (;;) {
      try {
        const logs = await publicClient.getLogs({
          address,
          events: events as never,
          fromBlock: from,
          toBlock: to,
        });
        out.push(...(logs as unknown as EvLog[]));
        break;
      } catch (err) {
        attempt++;
        if (attempt >= 3) throw err; // bubble up → caller falls back to the static list
        await sleep(300 * attempt);
      }
    }
    await sleep(60);
  }
  return out;
}

function buildGraph(citizenLogs: EvLog[], attesterLogs: EvLog[]): { nodes: CgNode[]; edges: CgEdge[] } {
  const nodesMap = new Map<string, CgNode>();
  const attesterReq = new Map<string, string>(); // requestId → attester address
  const citizenReq = new Map<string, string>(); // requestId → citizen address
  const attesterAddrs = new Set<string>();

  // Attester mints → active attester nodes (first 3 = founders).
  attesterLogs
    .filter((l) => l.eventName === "AttesterNFTMinted")
    .forEach((l, i) => {
      const a = norm(l.args.attester);
      if (!a) return;
      attesterAddrs.add(a);
      if (l.args.requestId != null) attesterReq.set(String(l.args.requestId), a);
      if (!nodesMap.has(a)) nodesMap.set(a, { id: a, address: a, type: "attester", isFounder: i < 3, status: "active" });
    });

  // Citizen mints → active citizen nodes (attester addresses take precedence).
  citizenLogs
    .filter((l) => l.eventName === "CitizenNFTMinted")
    .forEach((l, i) => {
      const a = norm(l.args.citizen);
      if (!a) return;
      if (l.args.requestId != null) citizenReq.set(String(l.args.requestId), a);
      if (attesterAddrs.has(a) || nodesMap.has(a)) return;
      nodesMap.set(a, { id: a, address: a, type: "citizen", isFounder: i < 3, status: "active" });
    });

  // Pending requests (only if the target is not already a member).
  citizenLogs
    .filter((l) => l.eventName === "AttestationRequestCreated")
    .forEach((l) => {
      const t = norm(l.args.target);
      if (!t || nodesMap.has(t)) return;
      nodesMap.set(t, { id: t, address: t, type: "citizen", isFounder: false, status: "pending" });
    });
  attesterLogs
    .filter((l) => l.eventName === "AttestationRequestCreated")
    .forEach((l) => {
      const t = norm(l.args.target);
      if (!t || nodesMap.has(t)) return;
      nodesMap.set(t, { id: t, address: t, type: "attester", isFounder: false, status: "pending" });
    });

  // Revocations mark existing nodes.
  citizenLogs
    .filter((l) => l.eventName === "CitizenNFTRevoked")
    .forEach((l) => {
      const n = nodesMap.get(norm(l.args.citizen));
      if (n) n.status = "revoked";
    });
  attesterLogs
    .filter((l) => l.eventName === "AttesterNFTRevoked")
    .forEach((l) => {
      const n = nodesMap.get(norm(l.args.attester));
      if (n) n.status = "revoked";
    });

  // Edges from approvals matched to a mint requestId.
  const edges: CgEdge[] = [];
  const edgeSet = new Set<string>();
  const addEdge = (approver: string, target: string | undefined, type: CgEdge["type"]) => {
    if (!approver || !target || approver === target) return;
    const id = `${approver}->${target}`;
    if (!edgeSet.has(id)) {
      edges.push({ id, source: approver, target, type });
      edgeSet.add(id);
    }
    const tn = nodesMap.get(target);
    if (tn) {
      (tn.verifiedBy ??= []);
      if (!tn.verifiedBy.includes(approver)) tn.verifiedBy.push(approver);
    }
  };
  attesterLogs
    .filter((l) => l.eventName === "RequestApproved")
    .forEach((l) => addEdge(norm(l.args.approver), attesterReq.get(String(l.args.requestId)), "attester_approved"));
  citizenLogs
    .filter((l) => l.eventName === "RequestApproved")
    .forEach((l) => addEdge(norm(l.args.approver), citizenReq.get(String(l.args.requestId)), "citizen_approved"));

  return { nodes: [...nodesMap.values()], edges };
}

function countsOf(nodes: CgNode[], edges: CgEdge[]): CgCounts {
  const active = nodes.filter((n) => n.status === "active");
  return {
    citizens: active.length,
    attesters: active.filter((n) => n.type === "attester").length,
    verifications: edges.length,
    pending: nodes.filter((n) => n.status === "pending").length,
    revoked: nodes.filter((n) => n.status === "revoked").length,
  };
}

/** Nodes-only fallback from the static snapshot (no edges) when the RPC scan fails. */
function fallbackNodes(): CgNode[] {
  return ROEBEL_CITIZENS.map((c, i) => {
    const a = c.address.toLowerCase();
    return {
      id: a,
      address: a,
      type: c.attester ? "attester" : "citizen",
      isFounder: c.attester && i < 3,
      status: "active" as const,
    };
  });
}

/** Pure contribution summary for the connected wallet (Town "Dein Beitrag" card). */
export function myContribution(
  wallet: string | null,
  nodes: CgNode[],
  edges: CgEdge[],
): { isCitizen: boolean; isAttester: boolean; verifiedCount: number } {
  const w = wallet ? wallet.toLowerCase() : null;
  if (!w) return { isCitizen: false, isAttester: false, verifiedCount: 0 };
  const node = nodes.find(
    (n) => n.address === w && n.status === "active" && (n.type === "citizen" || n.type === "attester"),
  );
  const verifiedCount = edges.filter((e) => e.source === w).length;
  return { isCitizen: !!node, isAttester: node?.type === "attester", verifiedCount };
}

export function useCitizenGraph(): {
  nodes: CgNode[];
  edges: CgEdge[];
  counts: CgCounts;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [nodes, setNodes] = useState<CgNode[]>([]);
  const [edges, setEdges] = useState<CgEdge[]>([]);
  const [counts, setCounts] = useState<CgCounts>({ citizens: 0, attesters: 0, verifications: 0, pending: 0, revoked: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetchGraph = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setError(null);
      const latest = await publicClient.getBlockNumber();
      const [citizenLogs, attesterLogs] = await Promise.all([
        scanContract(CITIZEN_NFT_V2, [CITIZEN_MINTED, CITIZEN_APPROVED, REQUEST_CREATED, CITIZEN_REVOKED], latest),
        scanContract(ATTESTER_NFT_V2, [ATTESTER_MINTED, ATTESTER_APPROVED, REQUEST_CREATED, ATTESTER_REVOKED], latest),
      ]);
      const g = buildGraph(citizenLogs, attesterLogs);
      if (g.nodes.length === 0) throw new Error("empty graph"); // treat as failure → fallback
      setNodes(g.nodes);
      setEdges(g.edges);
      setCounts(countsOf(g.nodes, g.edges));
    } catch (err) {
      const fb = fallbackNodes();
      setNodes(fb);
      setEdges([]);
      setCounts(countsOf(fb, []));
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setIsLoading(false);
      inFlight.current = false;
    }
  };

  useEffect(() => {
    void fetchGraph();
    const interval = setInterval(() => void fetchGraph(), 30_000);
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void fetchGraph();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { nodes, edges, counts, isLoading, error, refresh: () => void fetchGraph() };
}
