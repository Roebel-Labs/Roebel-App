// `notification_log` has no recipient column. Any targeted notification type
// must be excluded there and read from the wallet-scoped `notifications` table.
export const PERSONAL_NOTIFICATION_LOG_TYPES = [
  "direct_message",
  "post_like",
  "post_comment",
  "comment_like",
  "post_reply",
  "org_invite",
  "mini_app",
] as const;

export const PERSONAL_NOTIFICATION_LOG_FILTER = `(${PERSONAL_NOTIFICATION_LOG_TYPES.join(",")})`;

// Allow-list (preferred): only these notification_log types are genuinely meant for everyone. Any new
// targeted type (e.g. vorhaben_task) stays private by default. RLS on notification_log enforces the same
// list for the anon key (migration 20261006_notification_log_broadcast_only.sql).
export const BROADCAST_NOTIFICATION_LOG_TYPES = [
  "event_new",
  "news_breaking",
  "news_featured",
  "post_new",
  "broadcast",
  "proposal_new",
  "category",
] as const;
