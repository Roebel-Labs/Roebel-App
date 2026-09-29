/**
 * Irys Integration Utilities
 * Functions for extracting and fetching proposal content from Irys (Arweave)
 */

/**
 * Extract Irys URL from proposal description
 * Looks for URLs in the format: https://gateway.irys.xyz/{id}
 */
export function extractIrysUrl(description: string): string | null {
  // Match Irys gateway URLs
  const irysUrlRegex = /https:\/\/gateway\.irys\.xyz\/([a-zA-Z0-9_-]+)/;
  const match = description.match(irysUrlRegex);

  if (match && match[0]) {
    return match[0];
  }

  return null;
}

/**
 * Extract proposal title from description
 * Looks for markdown heading (# Title)
 */
export function extractProposalTitle(description: string): string | null {
  const titleRegex = /^#\s+(.+)$/m;
  const match = description.match(titleRegex);

  if (match && match[1]) {
    return match[1].trim();
  }

  return null;
}

// RN fetch never times out on its own; a stuck gateway would otherwise keep
// the proposal body spinner up forever instead of falling back to the summary.
const IRYS_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch markdown content from Irys gateway
 * @param irysUrl - Full Irys gateway URL (e.g., https://gateway.irys.xyz/abc123)
 * @returns Promise resolving to markdown content string
 */
export async function fetchMarkdownFromIrys(irysUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IRYS_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(irysUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/markdown, text/plain, */*',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const markdown = await response.text();
    return markdown;
  } catch (error) {
    console.error('Error fetching from Irys:', error);
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Failed to fetch content from Irys gateway'
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse proposal description to extract all components
 * Returns structured data about the proposal content
 */
export interface ParsedProposalContent {
  title: string | null;
  irysUrl: string | null;
  onchainDescription: string;
}

export function parseProposalDescription(description: string): ParsedProposalContent {
  return {
    title: extractProposalTitle(description),
    irysUrl: extractIrysUrl(description),
    onchainDescription: description,
  };
}

/**
 * Check if a proposal has Irys content
 */
export function hasIrysContent(description: string): boolean {
  return extractIrysUrl(description) !== null;
}
