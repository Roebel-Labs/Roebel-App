/**
 * TypeScript types for proposals
 * Matches Supabase schema and provides type safety throughout the application
 */

/**
 * Proposal state enum matching OpenZeppelin Governor
 * https://docs.openzeppelin.com/contracts/4.x/api/governance#IGovernor-ProposalState
 */
export enum ProposalState {
  Pending = 0,
  Active = 1,
  Canceled = 2,
  Defeated = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7,
}

/**
 * Proposal category for filtering and organization
 */
export type ProposalCategory =
  | "general"
  | "treasury"
  | "governance"
  | "technical"
  | "community"
  | "other";

/**
 * Core proposal data structure from Supabase
 */
export interface Proposal {
  // Database fields
  id: string; // UUID
  proposal_id: string; // Transaction hash (used for URL routing and lookup)
  blockchain_proposal_id: string; // Numeric on-chain proposal ID from Governor contract
  proposal_number: number; // Sequential number for easier reference
  title: string;
  summary: string; // Short description/preview
  content: ProposalContent; // Full markdown content as JSON
  category: ProposalCategory;

  // Irys/Arweave storage
  irys_content_id: string; // Irys receipt ID
  irys_url: string; // Full gateway URL

  // Blockchain data
  transaction_hash: string; // Creation transaction
  proposer_address: string; // Creator's wallet address
  block_number: bigint | null; // Block when created
  snapshot_block: bigint | null; // Block used for voting power snapshot
  deadline_block: bigint | null; // Block when voting ends

  // Voting data
  state: ProposalState;
  for_votes: string; // BigInt as string
  against_votes: string; // BigInt as string
  abstain_votes: string; // BigInt as string

  // Metadata
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  last_synced_at: string | null; // Last time synced from blockchain
}

/**
 * Proposal content structure stored as JSONB
 */
export interface ProposalContent {
  markdown: string; // Full markdown content
  version: string; // Content version for future compatibility
  metadata?: {
    wordCount?: number;
    estimatedReadTime?: number; // In minutes
    tags?: string[];
    /** Frozen Gemeinschaftskasse balance captured at proposal-store time. */
    gemeinschaftskasse_snapshot?: {
      euro: number;
      captured_at: string; // ISO; metadata only, never displayed
    };
  };
}

/**
 * Data required to create a new proposal in Supabase
 */
export interface CreateProposalInput {
  proposal_id: string; // Transaction hash for URL routing
  blockchain_proposal_id: string; // Numeric ID from blockchain event
  proposal_number: number;
  title: string;
  summary: string;
  content: ProposalContent;
  category?: ProposalCategory;
  irys_content_id: string;
  irys_url: string;
  transaction_hash: string;
  proposer_address: string;
  block_number: bigint;
  snapshot_block: bigint;
  deadline_block: bigint;
}

/**
 * Data required to update proposal voting state
 */
export interface UpdateProposalVotesInput {
  proposal_id: string;
  state: ProposalState;
  for_votes: string;
  against_votes: string;
  abstain_votes: string;
}

/**
 * Proposal with additional computed fields for display
 */
export interface ProposalWithMetadata extends Proposal {
  // Computed fields
  total_votes: bigint;
  participation_rate: number; // Percentage
  time_left: number | null; // Blocks remaining, null if ended
  is_active: boolean;
  is_executable: boolean;

  // Display helpers
  short_proposer: string; // Truncated address
  formatted_created_at: string; // Human-readable date
}

/**
 * Filters for querying proposals
 */
export interface ProposalFilters {
  state?: ProposalState | ProposalState[];
  category?: ProposalCategory | ProposalCategory[];
  proposer?: string;
  search?: string; // Search in title and summary
  limit?: number;
  offset?: number;
  orderBy?: "created_at" | "proposal_number" | "total_votes";
  orderDirection?: "asc" | "desc";
}

/**
 * Paginated response for proposal queries
 */
export interface ProposalsPaginatedResponse {
  proposals: Proposal[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * Helper function to get human-readable state label
 */
export function getProposalStateLabel(state: ProposalState): string {
  switch (state) {
    case ProposalState.Pending:
      return "Pending";
    case ProposalState.Active:
      return "Active";
    case ProposalState.Canceled:
      return "Canceled";
    case ProposalState.Defeated:
      return "Defeated";
    case ProposalState.Succeeded:
      return "Succeeded";
    case ProposalState.Queued:
      return "Queued";
    case ProposalState.Expired:
      return "Expired";
    case ProposalState.Executed:
      return "Executed";
    default:
      return "Unknown";
  }
}

/**
 * Helper function to get state color for UI
 */
export function getProposalStateColor(state: ProposalState): {
  bg: string;
  text: string;
  border: string;
} {
  switch (state) {
    case ProposalState.Pending:
      return {
        bg: "bg-yellow-900/30",
        text: "text-yellow-300",
        border: "border-yellow-700",
      };
    case ProposalState.Active:
      return {
        bg: "bg-green-900/30",
        text: "text-green-300",
        border: "border-green-700",
      };
    case ProposalState.Succeeded:
      return {
        bg: "bg-blue-900/30",
        text: "text-blue-300",
        border: "border-blue-700",
      };
    case ProposalState.Executed:
      return {
        bg: "bg-purple-900/30",
        text: "text-purple-300",
        border: "border-purple-700",
      };
    case ProposalState.Defeated:
      return {
        bg: "bg-red-900/30",
        text: "text-red-300",
        border: "border-red-700",
      };
    case ProposalState.Queued:
      return {
        bg: "bg-indigo-900/30",
        text: "text-indigo-300",
        border: "border-indigo-700",
      };
    case ProposalState.Canceled:
    case ProposalState.Expired:
      return {
        bg: "bg-gray-800/30",
        text: "text-muted-foreground",
        border: "border-gray-700",
      };
    default:
      return {
        bg: "bg-gray-800",
        text: "text-muted-foreground",
        border: "border-gray-700",
      };
  }
}

/**
 * Helper function to format address (0x1234...5678)
 */
export function formatAddress(address: string, startChars = 6, endChars = 4): string {
  if (!address || address.length < startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Helper function to format large numbers (votes)
 */
export function formatVotes(votes: string | bigint): string {
  const num = typeof votes === "string" ? BigInt(votes) : votes;
  if (num === 0n) return "0";
  if (num < 1000n) return num.toString();
  if (num < 1000000n) return `${(Number(num) / 1000).toFixed(1)}K`;
  return `${(Number(num) / 1000000).toFixed(1)}M`;
}

/**
 * Helper function to calculate reading time
 */
export function calculateReadingTime(markdown: string): number {
  const wordsPerMinute = 200;
  const wordCount = markdown.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
}

/**
 * Helper function to extract summary from markdown
 */
export function extractSummary(markdown: string, maxLength = 200): string {
  // Proposal content comes from a rich-text (HTML) editor and may also contain
  // markdown remnants. Strip BOTH so the summary is clean plain text (used for
  // list previews, the in-app notification, and the broadcast push body).
  const text = markdown
    // HTML: turn block boundaries into spaces, then drop all tags.
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    // Common HTML entities.
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    // Markdown remnants.
    .replace(/^#+\s+/gm, "") // headers
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links
    .replace(/`(.+?)`/g, "$1") // inline code
    .replace(/```[\s\S]*?```/g, "") // code blocks
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();

  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}
