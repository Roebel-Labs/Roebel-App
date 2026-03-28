import { ProposalState, ProposalVotes, VotePercentages } from './governance-types';
import { balanceOf } from 'thirdweb/extensions/erc721';
import { citizenNFTContract } from '@/constants/thirdweb';

/**
 * Get human-readable proposal state name (German)
 */
export function getProposalStateName(state: ProposalState): string {
  switch (state) {
    case ProposalState.Pending:
      return 'Ausstehend';
    case ProposalState.Active:
      return 'In Abstimmung';
    case ProposalState.Canceled:
      return 'Abgebrochen';
    case ProposalState.Defeated:
      return 'Abgelehnt';
    case ProposalState.Succeeded:
      return 'Genehmigt';
    case ProposalState.Queued:
      return 'In Warteschlange';
    case ProposalState.Expired:
      return 'Abgelaufen';
    case ProposalState.Executed:
      return 'Ausgeführt';
    default:
      return 'Unbekannt';
  }
}

/**
 * Get color for proposal state badge (matching mockup design)
 */
export function getProposalStateColor(state: ProposalState): {
  background: string;
  text: string;
} {
  switch (state) {
    case ProposalState.Active:
      return { background: '#FEF3C7', text: '#92400E' }; // Yellow/orange
    case ProposalState.Succeeded:
    case ProposalState.Executed:
      return { background: '#D1FAE5', text: '#065F46' }; // Green
    case ProposalState.Defeated:
    case ProposalState.Canceled:
      return { background: '#FEE2E2', text: '#991B1B' }; // Red
    case ProposalState.Pending:
      return { background: '#FFFBEB', text: '#92400E' }; // Light yellow
    case ProposalState.Queued:
      return { background: '#DBEAFE', text: '#1E40AF' }; // Blue
    case ProposalState.Expired:
      return { background: '#F3F4F6', text: '#374151' }; // Gray
    default:
      return { background: '#F3F4F6', text: '#6B7280' }; // Default gray
  }
}

/**
 * Check if proposal is currently active for voting
 */
export function isProposalActive(state: ProposalState): boolean {
  return state === ProposalState.Active;
}

/**
 * Format proposal description (truncate if needed)
 */
export function formatProposalDescription(
  description: string,
  maxLength: number = 100
): string {
  if (description.length <= maxLength) {
    return description;
  }
  return description.substring(0, maxLength) + '...';
}

/**
 * Calculate vote percentages from vote counts
 */
export function calculateVotePercentages(votes: ProposalVotes): VotePercentages {
  const total = votes.forVotes + votes.againstVotes + votes.abstainVotes;

  if (total === 0n) {
    return {
      forPercent: 0,
      againstPercent: 0,
      abstainPercent: 0,
      totalVotes: 0n,
    };
  }

  // Convert to numbers for percentage calculation
  const totalNum = Number(total);
  const forNum = Number(votes.forVotes);
  const againstNum = Number(votes.againstVotes);
  const abstainNum = Number(votes.abstainVotes);

  return {
    forPercent: (forNum / totalNum) * 100,
    againstPercent: (againstNum / totalNum) * 100,
    abstainPercent: (abstainNum / totalNum) * 100,
    totalVotes: total,
  };
}

/**
 * Shorten ethereum address
 */
export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Check if an address owns a Citizen NFT
 */
export async function checkCitizenStatus(address: string): Promise<boolean> {
  try {
    const balance = await balanceOf({
      contract: citizenNFTContract,
      owner: address,
    });
    return balance > 0n;
  } catch (error) {
    console.error('Error checking citizen status:', error);
    return false;
  }
}

/**
 * Format bigint to readable number string
 */
export function formatBigInt(value: bigint): string {
  return value.toString();
}

/**
 * Calculate reading time estimate in minutes
 */
export function calculateReadingTime(text: string): number {
  const wordsPerMinute = 200;
  const wordCount = text.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / wordsPerMinute);
  return Math.max(1, readingTime); // Minimum 1 min
}
