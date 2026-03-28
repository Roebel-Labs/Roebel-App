"use client";

import { MarkdownRenderer } from "./MarkdownRenderer";

interface ProposalContentProps {
  markdown: string;
  isLoading?: boolean;
}

export function ProposalContent({ markdown, isLoading = false }: ProposalContentProps) {
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-4 bg-muted rounded w-5/6" />
        </div>
      </div>
    );
  }

  // Check if content is HTML (starts with < tag) or markdown
  const isHTML = markdown.trim().startsWith('<');

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-8">
      {isHTML ? (
        <div
          className="prose prose-sm sm:prose lg:prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: markdown }}
        />
      ) : (
        <MarkdownRenderer content={markdown} />
      )}
    </div>
  );
}
