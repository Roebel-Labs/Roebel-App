import { completionProgress, isSingleStep, missingProfileSteps } from '../profile-completion';

const complete = {
  display_name: 'Max',
  profile_picture_url: 'https://example.org/a.jpg',
  preferred_role: 'buerger' as const,
  terms_accepted_at: '2026-09-01T00:00:00Z',
  auth_provider: 'google',
};

describe('missingProfileSteps', () => {
  it('is empty for a complete profile and for no user', () => {
    expect(missingProfileSteps(complete)).toEqual([]);
    expect(missingProfileSteps(null)).toEqual([]);
    expect(missingProfileSteps(undefined)).toEqual([]);
  });

  it('lists every skipped step in wizard order with the same step UI', () => {
    const steps = missingProfileSteps({
      display_name: null,
      profile_picture_url: null,
      preferred_role: null,
      terms_accepted_at: null,
      auth_provider: 'passkey',
    });
    expect(steps.map((s) => s.id)).toEqual(['name', 'photo', 'role', 'terms']);
    expect(steps.map((s) => s.route)).toEqual([
      '/welcome/name?single=1',
      '/edit-profile',
      '/welcome/role?single=1',
      '/welcome/consent?single=1',
    ]);
    for (const s of steps) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.subtitle.length).toBeGreaterThan(0);
    }
  });

  it('treats a blank name or photo as missing', () => {
    expect(missingProfileSteps({ ...complete, display_name: '   ' }).map((s) => s.id)).toEqual(['name']);
    expect(missingProfileSteps({ ...complete, profile_picture_url: '' }).map((s) => s.id)).toEqual(['photo']);
  });

  it('never asks Apple sign-ins for a name (Apple provides it)', () => {
    expect(missingProfileSteps({ ...complete, display_name: null, auth_provider: 'apple' })).toEqual([]);
  });

  it('works for thirdweb and passkey sessions alike (reads only the users row)', () => {
    for (const auth_provider of ['google', 'email', 'passkey', null]) {
      expect(missingProfileSteps({ ...complete, auth_provider, terms_accepted_at: null }).map((s) => s.id)).toEqual(['terms']);
    }
  });
});

describe('completionProgress', () => {
  it('counts done steps out of four', () => {
    expect(completionProgress(0)).toBe('4 von 4 erledigt');
    expect(completionProgress(3)).toBe('1 von 4 erledigt');
    expect(completionProgress(4)).toBe('0 von 4 erledigt');
    expect(completionProgress(9)).toBe('0 von 4 erledigt');
  });
});

describe('isSingleStep', () => {
  it('reads the route param', () => {
    expect(isSingleStep('1')).toBe(true);
    expect(isSingleStep('true')).toBe(true);
    expect(isSingleStep(['1'])).toBe(true);
    expect(isSingleStep(undefined)).toBe(false);
    expect(isSingleStep('0')).toBe(false);
  });
});
