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
