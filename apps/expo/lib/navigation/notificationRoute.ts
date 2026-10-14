/**
 * Where a tapped push notification leads, from its `data` payload. One mapping
 * for both the warm tap (response listener) and the cold start (last response),
 * so the two can never drift apart. null = no screen of its own (app just opens).
 */
type NotificationData = Record<string, unknown> | null | undefined;

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

export function vorhabenRoute(data: { screen?: unknown; proposalId?: unknown; taskId?: unknown }): string | null {
  const proposalId = str(data.proposalId);
  const taskId = str(data.taskId);
  if (data.screen === 'aufgabe' && taskId) return `/aufgabe/${taskId}`;
  if (!proposalId) return null;
  if (data.screen === 'auszaehlung') return `/auszaehlung/${proposalId}`;
  if (data.screen === 'vertrag') return `/vertrag/${proposalId}`;
  return `/proposal/${proposalId}`;
}

export function routeForNotification(data: NotificationData): string | null {
  if (!data) return null;
  switch (data.type) {
    case 'event':
      return str(data.eventId) && `/event/${data.eventId}`;
    case 'news':
      return str(data.slug) && `/news/${data.slug}`;
    case 'post':
      return str(data.postId) && `/post/${data.postId}`;
    case 'forum_thread':
      return str(data.threadId) && `/forum/thread/${data.threadId}`;
    case 'direct_message':
      return str(data.conversationId) && `/messages/${data.conversationId}`;
    case 'chat_thread':
      return str(data.threadId) && `/chat/${data.threadId}`;
    case 'vorhaben':
      return vorhabenRoute(data);
    case 'org_invite':
      return '/notifications';
    case 'reward':
      return '/rewards';
    case 'org':
      // Weekly follower digest for org owners/admins.
      return str(data.accountId) && `/account/${data.accountId}`;
    default:
      return null;
  }
}
