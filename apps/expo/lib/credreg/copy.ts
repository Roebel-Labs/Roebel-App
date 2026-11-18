/**
 * Copy guard for the credential screens (spec 5.6b): credentials look like cards and stamps,
 * so user-facing text never uses these words. Tests run every label through assertCleanCopy.
 */
export const FORBIDDEN_UI_WORDS: readonly RegExp[] = [/\bNFT\b/i, /\bToken\b/i, /\bWallet\b/i, /\bBlockchain\b/i, /\bChain\b/i];

/** Returns the offending strings (empty = all clean). */
export function assertCleanCopy(texts: readonly string[]): string[] {
  return texts.filter((t) => FORBIDDEN_UI_WORDS.some((re) => re.test(t)));
}
