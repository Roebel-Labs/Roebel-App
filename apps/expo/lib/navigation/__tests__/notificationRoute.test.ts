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

  it('opens the profile detail sheet for a credential visibility push', () => {
    const typeId = '0x' + 'ab'.repeat(32);
    expect(routeForNotification({ type: 'credential_visibility', typeId })).toBe(`/profile?credential=${typeId}`);
    expect(routeForNotification({ type: 'credential_visibility', typeId: 'nope' })).toBe('/profile');
  });

  it('opens the accept screen for a credential invite and the confirm screen for a credential action', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(routeForNotification({ type: 'credential_invite', invitationId: id })).toBe(`/credentials/accept/${id}`);
    expect(routeForNotification({ type: 'credential_action', actionId: id })).toBe(`/org/credentials/approve/${id}`);
    expect(routeForNotification({ type: 'credential_invite', invitationId: '../x' })).toBe('/credentials');
    expect(routeForNotification({ type: 'credential_action', actionId: 'nope' })).toBeNull();
    expect(routeForNotification({ type: 'credential_letters' })).toBe('/credentials');
  });

  it('returns null without a target', () => {
    expect(routeForNotification(null)).toBeNull();
    expect(routeForNotification({ type: 'post' })).toBeNull();
    expect(routeForNotification({ type: 'post', postId: '' })).toBeNull();
    expect(routeForNotification({ type: 'vorhaben' })).toBeNull();
    expect(routeForNotification({ type: 'unknown', postId: 'x' })).toBeNull();
  });
});
