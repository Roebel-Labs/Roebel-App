/**
 * Display-text selection for proposals.
 *
 * Supabase is the source of truth for the DISPLAY text (title, summary,
 * body): admins can correct a typo or an amount there after the proposal
 * went on chain, while the Irys upload is immutable. The Irys gateway is
 * only a fallback for rows that carry no body in Supabase. Chain data
 * (state, votes, deadline, poll) is not touched by anything in this file.
 *
 * Pure functions only, so the precedence rules are unit-testable.
 */

function nonEmpty(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().length > 0 ? value : null;
}

/**
 * The body stored in `proposals.content` (jsonb `{ version, markdown }`).
 * `markdown` is HTML-ish in practice (same format as the Irys upload), which
 * ProposalContent renders via RenderHTML when it starts with `<`.
 * Returns null when the column is missing, malformed or blank.
 */
export function supabaseContentMarkdown(content: unknown): string | null {
  if (!content || typeof content !== 'object') return null;
  return nonEmpty((content as { markdown?: unknown }).markdown);
}

/** True when the page has to fetch the body from Irys (no Supabase body). */
export function needsIrysFallback(contentMarkdown: string | null | undefined): boolean {
  return nonEmpty(contentMarkdown) === null;
}

/** Title precedence: Supabase title, then summary, then on-chain description. */
export function pickProposalTitle(p: {
  title?: string | null;
  summary?: string | null;
  description?: string | null;
}): string {
  return nonEmpty(p.title) ?? nonEmpty(p.summary) ?? nonEmpty(p.description) ?? '';
}

/**
 * Body precedence: Supabase `content.markdown`, then the Irys document,
 * then the Supabase summary, then the on-chain description.
 */
export function pickProposalBody(p: {
  contentMarkdown?: string | null;
  irysMarkdown?: string | null;
  summary?: string | null;
  description?: string | null;
}): string {
  return (
    nonEmpty(p.contentMarkdown) ??
    nonEmpty(p.irysMarkdown) ??
    nonEmpty(p.summary) ??
    nonEmpty(p.description) ??
    ''
  );
}
