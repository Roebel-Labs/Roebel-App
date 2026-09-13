import { profileHeaderTitle } from '../profile-header';

describe('profileHeaderTitle', () => {
  it('is "Profil" for a personal account or no account', () => {
    expect(profileHeaderTitle(null)).toBe('Profil');
    expect(profileHeaderTitle({ account_type: 'personal', sub_type: null })).toBe('Profil');
  });
  it('uses the org sub-type label', () => {
    expect(profileHeaderTitle({ account_type: 'organisation', sub_type: 'verein' })).toBe('Verein');
    expect(profileHeaderTitle({ account_type: 'organisation', sub_type: 'unternehmen' })).toBe('Unternehmen');
    expect(profileHeaderTitle({ account_type: 'organisation', sub_type: 'journalist' })).toBe('Journalist:in');
  });
  it('falls back for an unknown sub-type', () => {
    expect(profileHeaderTitle({ account_type: 'organisation', sub_type: null })).toBe('Organisation');
  });
});
