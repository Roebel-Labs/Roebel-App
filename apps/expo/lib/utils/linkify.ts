// Splits post text into plain-text and URL tokens so URLs can be rendered as
// tappable spans. Matches http(s):// URLs and bare www. URLs. Trailing
// sentence punctuation is peeled off the match so "see https://x.de." doesn't
// swallow the period into the link.

const URL_REGEX = /((?:https?:\/\/|www\.)[^\s]+)/gi;
const TRAILING_PUNCT = /[)\].,!?;:'"»…]+$/;

export type LinkToken =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string; href: string };

/** Tokenize a string into ordered text / url segments (URLs preserved verbatim). */
export function parseLinkTokens(text: string): LinkToken[] {
  if (!text) return [];

  const tokens: LinkToken[] = [];
  let lastIndex = 0;
  URL_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const start = match.index;
    const full = match[0];

    // Peel trailing punctuation back out into a following text token.
    const trailing = full.match(TRAILING_PUNCT)?.[0] ?? '';
    const url = trailing ? full.slice(0, full.length - trailing.length) : full;

    if (start > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, start) });
    }

    if (url) {
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      tokens.push({ type: 'url', value: url, href });
    }
    if (trailing) tokens.push({ type: 'text', value: trailing });

    lastIndex = start + full.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}

/** True when the string contains at least one linkable URL. */
export function containsLink(text: string | null | undefined): boolean {
  if (!text) return false;
  URL_REGEX.lastIndex = 0;
  return URL_REGEX.test(text);
}
