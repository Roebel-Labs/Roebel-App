// Read-only governance proposals for the Governance tab.
//
// Proposals are created on-chain (MaciAttesterGovernor on Gnosis) and indexed into the
// public Supabase `proposals` table (RLS: "viewable by everyone"). We read that table
// directly with the publishable anon key — same source the apps/web proposal LIST page
// uses. Voting is MACI-private and happens only in the Röbel app; here everything is
// read-only. Every fetch is best-effort so the UI never throws.
import { createPublicClient, http } from "viem";
import { gnosis } from "viem/chains";
import { SUPABASE_URL, SUPABASE_ANON } from "./supabase";
import { GNOSIS_RPC } from "./circles";

export interface ProposalContent {
  markdown?: string;
  version?: string;
  metadata?: {
    wordCount?: number;
    estimatedReadTime?: number;
    tags?: string[];
    gemeinschaftskasse_snapshot?: { euro: number; captured_at: string };
  };
}

export interface Proposal {
  proposal_id: string; // tx hash — the route key
  blockchain_proposal_id: string | null;
  proposal_number: number | null;
  title: string;
  summary: string | null;
  content: ProposalContent | null;
  category: string | null;
  irys_content_id: string | null;
  irys_url: string | null;
  transaction_hash: string | null;
  proposer_address: string | null;
  state: number; // OZ Governor enum 0..7
  for_votes: string | null;
  against_votes: string | null;
  abstain_votes: string | null;
  created_at: string;
  deadline_block: string | null;
}

const COLUMNS =
  "proposal_id,blockchain_proposal_id,proposal_number,title,summary,content,category,irys_content_id,irys_url,transaction_hash,proposer_address,state,for_votes,against_votes,abstain_votes,created_at,deadline_block";

const headers = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };

async function rest(path: string): Promise<Proposal[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/proposals?${path}`, { headers });
    if (!res.ok) return [];
    return (await res.json()) as Proposal[];
  } catch {
    return [];
  }
}

/** All proposals, newest first. */
export async function getProposals(): Promise<Proposal[]> {
  return rest(`select=${COLUMNS}&order=created_at.desc`);
}

/** A single proposal by its `proposal_id` (tx hash) or `transaction_hash`. */
export async function getProposalById(id: string): Promise<Proposal | null> {
  const enc = encodeURIComponent(id);
  const rows = await rest(`select=${COLUMNS}&or=(proposal_id.eq.${enc},transaction_hash.eq.${enc})&limit=1`);
  return rows[0] ?? null;
}

/** The full proposal body: prefer the permanent Irys copy, fall back to the Supabase markdown. */
export async function fetchProposalBody(p: Proposal): Promise<string> {
  const url = p.irys_url || (p.irys_content_id ? `https://gateway.irys.xyz/${p.irys_content_id}` : null);
  if (url) {
    try {
      const res = await fetch(url, { headers: { Accept: "text/html, text/markdown, text/plain, */*" } });
      if (res.ok) {
        const body = (await res.text()).trim();
        if (body) return body;
      }
    } catch {
      /* fall through to Supabase copy */
    }
  }
  return p.content?.markdown?.trim() || "";
}

// ── Governor state helpers ───────────────────────────────────────────────────
// OpenZeppelin Governor proposal-state enum.
export const STATE_LABEL: Record<number, string> = {
  0: "Ausstehend",
  1: "Aktiv",
  2: "Abgebrochen",
  3: "Abgelehnt",
  4: "Angenommen",
  5: "In Warteschlange",
  6: "Abgelaufen",
  7: "Umgesetzt",
};

export const stateLabel = (s: number) => STATE_LABEL[s] ?? "Unbekannt";
/** Pending or Active — the still-votable window. */
export const isActiveState = (s: number) => s === 0 || s === 1;

/** Sort key so Active/Pending float above closed proposals (then newest-first by caller). */
export const proposalGroupRank = (s: number) => (isActiveState(s) ? 0 : 1);

const toNum = (v: string | null) => {
  try {
    return v ? Number(BigInt(v)) / 1e18 : 0;
  } catch {
    return Number(v) || 0;
  }
};

export interface VoteTally {
  forV: number;
  against: number;
  abstain: number;
  total: number;
}
export function tally(p: Proposal): VoteTally {
  const forV = toNum(p.for_votes);
  const against = toNum(p.against_votes);
  const abstain = toNum(p.abstain_votes);
  return { forV, against, abstain, total: forV + against + abstain };
}

// ── MACI sign-ups (the DAO electorate) ───────────────────────────────────────
// `numSignUps` = how many citizens have registered a MACI voting key. This is the
// "who can vote" number the apps/web admin "DAO & Bürger" page shows — NOT votes
// cast (ballots are encrypted and only countable after the coordinator tally) and
// NOT Circles-verified humans. Read on-chain from the MACI core on Gnosis.
const MACI_CORE = "0x6663eDC8650276fe264710B1A2ba46eB8bd0bF1D" as const;
const maciAbi = [
  { type: "function", name: "numSignUps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;
const chainClient = createPublicClient({ chain: gnosis, transport: http(GNOSIS_RPC) });

/** Total MACI sign-ups — citizens registered to vote in the DAO. Best-effort → 0. */
export async function getMaciSignups(): Promise<number> {
  try {
    const n = (await chainClient.readContract({ address: MACI_CORE, abi: maciAbi, functionName: "numSignUps" })) as bigint;
    return Number(n);
  } catch {
    return 0;
  }
}
