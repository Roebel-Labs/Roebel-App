import { useState, useEffect } from 'react';
import { ProposalContent } from '@/lib/governance-types';
import {
  parseProposalDescription,
  fetchMarkdownFromIrys,
  hasIrysContent,
} from '@/lib/irys-utils';

/**
 * Custom hook to fetch and manage proposal content from Irys
 * @param description - The on-chain proposal description
 * @returns ProposalContent with markdown, loading, and error states
 */
export function useProposalContent(description: string): ProposalContent {
  const [content, setContent] = useState<ProposalContent>({
    title: null,
    irysUrl: null,
    markdownContent: null,
    onchainDescription: description,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let isCancelled = false;

    async function fetchContent() {
      // Reset loading state
      setContent((prev) => ({ ...prev, loading: true, error: null }));

      try {
        // Parse the on-chain description
        const parsed = parseProposalDescription(description);

        // If no Irys URL found, just use on-chain description
        if (!parsed.irysUrl) {
          if (!isCancelled) {
            setContent({
              title: parsed.title,
              irysUrl: null,
              markdownContent: null,
              onchainDescription: description,
              loading: false,
              error: null,
            });
          }
          return;
        }

        // Fetch markdown content from Irys
        const markdown = await fetchMarkdownFromIrys(parsed.irysUrl);

        if (!isCancelled) {
          setContent({
            title: parsed.title,
            irysUrl: parsed.irysUrl,
            markdownContent: markdown,
            onchainDescription: description,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        console.error('Error fetching proposal content from Irys:', error);

        if (!isCancelled) {
          const parsed = parseProposalDescription(description);
          setContent({
            title: parsed.title,
            irysUrl: parsed.irysUrl,
            markdownContent: null,
            onchainDescription: description,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to load content from Irys. Showing on-chain description instead.',
          });
        }
      }
    }

    fetchContent();

    return () => {
      isCancelled = true;
    };
  }, [description]);

  return content;
}

/**
 * Check if a description has Irys content (for UI indicators)
 */
export function useHasIrysContent(description: string): boolean {
  return hasIrysContent(description);
}
