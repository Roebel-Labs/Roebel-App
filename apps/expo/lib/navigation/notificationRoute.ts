/**
 * Where a tapped push notification leads, from its `data` payload. One mapping
 * for both the warm tap (response listener) and the cold start (last response),
 * so the two can never drift apart. null = no screen of its own (app just opens).
 */
type NotificationData = Record<string, unknown> | null | undefined;

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // Live room reminders ("Jetzt auf der Fläche: …") carry the show slug, whatever their type.
  const liveSlug = str(data.liveSlug);
  if (liveSlug) return `/live/${liveSlug}`;
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
    case 'event_request':
      // An event found for an organisation the person manages: publish, change or decline.
      return str(data.requestId) && `/chat/event-request/${data.requestId}`;
    case 'org_invite':
      return '/notifications';
    case 'sponsoring':
      return str(data.slug) && `/org/sponsoring/${data.slug}`;
    case 'reward':
      return '/rewards';
    case 'credential_visibility': {
      // An org stopped showing its members: the profile opens the detail sheet of that type.
      const typeId = str(data.typeId);
      return typeId && /^0x[0-9a-fA-F]{64}$/.test(typeId) ? `/profile?credential=${typeId}` : '/profile';
    }
    case 'credential_invite': {
      // A new Ausweis: the accept screen (public/private choice). Unknown id → the inbox.
      const invitationId = str(data.invitationId);
      return invitationId && UUID.test(invitationId) ? `/credentials/accept/${invitationId}` : '/credentials';
    }
    case 'credential_letters':
      return '/credentials';
    case 'credential_action': {
      // A step prepared on a desktop, waiting for this phone to confirm.
      const actionId = str(data.actionId);
      return actionId && UUID.test(actionId) ? `/org/credentials/approve/${actionId}` : null;
    }
    case 'design_test': {
      // A card design draft sent to this phone for testing (only its org's admins can open it).
      const draftId = str(data.draftId);
      return draftId && UUID.test(draftId) ? `/org/credentials/design-test?draft=${draftId}` : null;
    }
    case 'org':
      // Weekly follower digest for org owners/admins.
      return str(data.accountId) && `/account/${data.accountId}`;
    default:
      return null;
  }
}
