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

/** Visual category of an inbox row — selects the avatar badge and filter tab. */
export type ActivityKind = 'like' | 'comment' | 'invite' | 'news' | 'system';

export function activityKindForType(type: string | null | undefined): ActivityKind {
  switch (type) {
    case 'post_like':
    case 'comment_like':
      return 'like';
    case 'post_comment':
    case 'post_reply':
      return 'comment';
    case 'org_invite':
    case 'story_invite':
    case 'foerder_invite':
      return 'invite';
    default:
      return 'system';
  }
}

/**
 * Standalone action line shown under the actor name (Threads-style
 * "Followed you"). Returns null for types whose body carries the message.
 */
export function notificationActionLabel(type: string | null | undefined): string | null {
  switch (type) {
    case 'post_like':
      return 'Gefällt dein Beitrag';
    case 'comment_like':
      return 'Gefällt dein Kommentar';
    case 'post_comment':
      return 'Hat deinen Beitrag kommentiert';
    case 'post_reply':
      return 'Hat auf deinen Kommentar geantwortet';
    default:
      return null;
  }
}

/**
 * Content excerpt shown under the action line (e.g. the comment text).
 * Older rows store the action sentence itself as the body ("hat deinen
 * Beitrag geliked") — those are suppressed so the action line isn't doubled.
 */
export function notificationPreview(
  type: string | null | undefined,
  body: string | null | undefined
): string | null {
  const cleaned = cleanNotificationBody(body);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (lower.startsWith('hat ') || lower.startsWith('gefällt ')) return null;
  if (type === 'post_comment' || type === 'post_reply') return cleaned;
  // Unknown types: body is the message itself.
  if (notificationActionLabel(type) === null) return cleaned;
  return null;
}

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
