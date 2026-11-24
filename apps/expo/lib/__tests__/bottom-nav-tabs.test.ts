import { bottomNavItems } from '../../components/navigation/tab-items';

describe('bottomNavItems', () => {
  it('labels the org shell in German, in shell order', () => {
    expect(bottomNavItems(['home', 'dashboard', 'chat', 'profile']).map((t) => t.label)).toEqual([
      'Austausch',
      'Dashboard',
      'Chat',
      'Profil',
    ]);
  });

  it('labels the citizen shell', () => {
    expect(bottomNavItems(['home', 'explore', 'profile']).map((t) => t.label)).toEqual([
      'Austausch',
      'Erkunden',
      'Profil',
    ]);
  });

  it('gives every item a stroke and a filled icon', () => {
    for (const t of bottomNavItems(['home', 'explore', 'dashboard', 'chat', 'profile'])) {
      expect(t.stroke).toBeTruthy();
      expect(t.filled).toBeTruthy();
    }
  });
});
