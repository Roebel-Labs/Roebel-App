import { ORG_PROFILE_ACTIONS, PERSONAL_PROFILE_ACTIONS } from '../profile-actions';

describe('PERSONAL_PROFILE_ACTIONS', () => {
  it('has the seven mockup actions in order', () => {
    expect(PERSONAL_PROFILE_ACTIONS.map((a) => a.key)).toEqual([
      'abfallkalender',
      'governance',
      'create-org',
      'submit-event',
      'create-listing',
      'create-service',
      'tickets',
    ]);
  });
  it('routes the service tile to the listing form with the service type', () => {
    const svc = PERSONAL_PROFILE_ACTIONS.find((a) => a.key === 'create-service')!;
    expect(svc.href).toBe('/create-listing');
    expect(svc.params).toEqual({ listingType: 'service' });
  });
});

describe('ORG_PROFILE_ACTIONS', () => {
  it('has five actions and keeps the auth gate on the create actions', () => {
    expect(ORG_PROFILE_ACTIONS.map((a) => a.key)).toEqual([
      'create-product',
      'create-service',
      'submit-event',
      'org-ads',
      'org-dashboard',
    ]);
    expect(ORG_PROFILE_ACTIONS.filter((a) => a.auth).map((a) => a.key)).toEqual([
      'create-product',
      'create-service',
      'submit-event',
    ]);
  });
});

it('every href is an absolute route', () => {
  for (const a of [...PERSONAL_PROFILE_ACTIONS, ...ORG_PROFILE_ACTIONS]) {
    expect(a.href.startsWith('/')).toBe(true);
    expect(a.label.length).toBeGreaterThan(0);
  }
});
