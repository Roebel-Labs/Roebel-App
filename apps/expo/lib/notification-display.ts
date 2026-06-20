/**
 * Notification display helpers
 *
 * Sanitises notification titles and bodies before they reach the UI so we never
 * render raw wallet addresses or raw message payloads (e.g. marketplace
 * "listing_inquiry" JSON). Used by both the push-notification card
 * (`notification_log`) and the in-app generic card (`notifications` table).
 *
 * The DB triggers now produce clean titles/bodies for *new* notifications, but
 * older rows are already stored — these helpers clean those at render time too.
 */

/** Matches a full or truncated 0x wallet address (e.g. "0xdef3ab91…"). */
const WALLET_RE = /^0x[a-fA-F0-9]{6,}$/i;

export function isWalletLike(value: string | null | undefined): boolean {
  if (!value) return false;
  // Trim a trailing ellipsis from truncated stored titles before testing.
  const trimmed = value.replace(/[…\.]+$/, '').trim();
  return WALLET_RE.test(trimmed);
}

/**
 * Returns a human-readable title. If the stored title is a wallet address
 * (personal accounts sometimes store their wallet as the account name), fall
 * back to a friendly, type-appropriate label instead of showing the 0x… string.
 */
export function cleanNotificationTitle(
  title: string | null | undefined,
  type: string | null | undefined
): string {
  const value = (title ?? '').trim();
  if (value && !isWalletLike(value)) return value;

  switch (type) {
    case 'direct_message':
      return 'Neue Nachricht';
    case 'post_new':
    case 'post':
      return 'Neuer Beitrag';
    case 'post_like':
    case 'post_comment':
      return 'Jemand';
    default:
      return 'Röbel';
  }
}

/**
 * Returns a human-readable body. Marketplace inquiries are sent as JSON message
 * content; render a short product preview instead. Any other JSON object falls
 * back to a generic label so raw payloads never reach the UI.
 */
export function cleanNotificationBody(body: string | null | undefined): string {
  const value = (body ?? '').trim();
  if (!value) return '';

  // Fast path: only attempt to parse strings that look like a JSON object.
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        if (parsed.type === 'listing_inquiry' || parsed.type === 'product_inquiry') {
          return `📦 ${parsed.title || 'Marktplatz-Anfrage'}`;
        }
        return 'Neue Nachricht';
      }
    } catch {
      // Not JSON — fall through and return the original text.
    }
  }

  return value;
}
