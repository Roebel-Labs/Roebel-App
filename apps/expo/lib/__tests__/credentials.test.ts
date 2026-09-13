import { credentialKindsFor, CREDENTIAL_COPY, type CredentialKind } from '../credentials';

describe('credentialKindsFor', () => {
  it('gives guests the guest card only', () => {
    expect(credentialKindsFor({ isCitizen: false, isAttester: false })).toEqual(['guest']);
  });
  it('gives citizens the citizen card only', () => {
    expect(credentialKindsFor({ isCitizen: true, isAttester: false })).toEqual(['citizen']);
  });
  it('stacks the attester card in front of the citizen card', () => {
    expect(credentialKindsFor({ isCitizen: true, isAttester: true })).toEqual(['citizen', 'attester']);
  });
  it('treats an attester without the citizen flag as citizen + attester', () => {
    expect(credentialKindsFor({ isCitizen: false, isAttester: true })).toEqual(['citizen', 'attester']);
  });
});

describe('CREDENTIAL_COPY', () => {
  const kinds: CredentialKind[] = ['guest', 'citizen', 'attester'];
  it.each(kinds)('%s has a title, intro and at least three benefits', (kind) => {
    const copy = CREDENTIAL_COPY[kind];
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.label.length).toBeGreaterThan(0);
    expect(copy.intro.length).toBeGreaterThan(20);
    expect(copy.benefits.length).toBeGreaterThanOrEqual(3);
    for (const b of copy.benefits) {
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.desc.length).toBeGreaterThan(0);
    }
  });
  it('never mentions CRC', () => {
    const text = JSON.stringify(CREDENTIAL_COPY);
    expect(text).not.toMatch(/\bCRC\b/);
  });
  it('guest CTA leads to becoming a citizen', () => {
    expect(CREDENTIAL_COPY.guest.cta?.kind).toBe('become-citizen');
  });
});
