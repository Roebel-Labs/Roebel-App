import { routeForNotification } from '../notificationRoute';

describe('routeForNotification', () => {
  it('maps a new-post push to the post screen', () => {
    expect(routeForNotification({ type: 'post', postId: 'dc9b89f8' })).toBe('/post/dc9b89f8');
  });

  it('maps every content type', () => {
    expect(routeForNotification({ type: 'event', eventId: 'e1' })).toBe('/event/e1');
    expect(routeForNotification({ type: 'news', slug: 'stadtfest' })).toBe('/news/stadtfest');
    expect(routeForNotification({ type: 'forum_thread', threadId: 't1' })).toBe('/forum/thread/t1');
    expect(routeForNotification({ type: 'direct_message', conversationId: 'c1' })).toBe('/messages/c1');
    expect(routeForNotification({ type: 'chat_thread', threadId: 'ch1' })).toBe('/chat/ch1');
    expect(routeForNotification({ type: 'org_invite' })).toBe('/notifications');
    expect(routeForNotification({ type: 'reward' })).toBe('/rewards');
    expect(routeForNotification({ type: 'org', accountId: 'a1' })).toBe('/account/a1');
  });

  it('maps Vorhaben screens', () => {
    expect(routeForNotification({ type: 'vorhaben', proposalId: 'p1' })).toBe('/proposal/p1');
    expect(routeForNotification({ type: 'vorhaben', proposalId: 'p1', screen: 'auszaehlung' })).toBe('/auszaehlung/p1');
    expect(routeForNotification({ type: 'vorhaben', proposalId: 'p1', screen: 'vertrag' })).toBe('/vertrag/p1');
    expect(routeForNotification({ type: 'vorhaben', proposalId: 'p1', screen: 'aufgabe', taskId: 'k1' })).toBe('/aufgabe/k1');
  });

  it('returns null without a target', () => {
    expect(routeForNotification(null)).toBeNull();
    expect(routeForNotification({ type: 'post' })).toBeNull();
    expect(routeForNotification({ type: 'post', postId: '' })).toBeNull();
    expect(routeForNotification({ type: 'vorhaben' })).toBeNull();
    expect(routeForNotification({ type: 'unknown', postId: 'x' })).toBeNull();
  });
});
