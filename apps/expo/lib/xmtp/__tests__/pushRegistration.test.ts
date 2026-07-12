import { welcomeTopicFor } from '../pushRegistration';

describe('welcomeTopicFor', () => {
  it('builds the MLS v1 welcome topic (5.7.0 has no welcomeTopic())', () => {
    expect(welcomeTopicFor('abc123')).toBe('/xmtp/mls/1/w-abc123/proto');
  });

  it('is a pure function of the installation id', () => {
    expect(welcomeTopicFor('9f8e7d')).toBe('/xmtp/mls/1/w-9f8e7d/proto');
  });
});
