import { shellTabsFor, landingTabAfterSwitch, isTabInShell } from '../navigation/shell-tabs';
import type { Account } from '../types';

const personal = { id: 'p', account_type: 'personal' } as unknown as Account;
const org = { id: 'o', account_type: 'organisation' } as unknown as Account;

describe('shellTabsFor', () => {
  it('gives the citizen shell when no account is loaded', () => {
    expect(shellTabsFor({ account: null, role: null, orgShellEnabled: true })).toEqual(['home', 'explore', 'profile']);
  });

  it('gives the citizen shell to a personal account', () => {
    expect(shellTabsFor({ account: personal, role: 'owner', orgShellEnabled: true })).toEqual([
      'home',
      'explore',
      'profile',
    ]);
  });

  it('gives owners and admins the full org shell', () => {
    const full = ['home', 'dashboard', 'chat', 'profile'];
    expect(shellTabsFor({ account: org, role: 'owner', orgShellEnabled: true })).toEqual(full);
    expect(shellTabsFor({ account: org, role: 'admin', orgShellEnabled: true })).toEqual(full);
  });

  it('hides the dashboard from plain members', () => {
    expect(shellTabsFor({ account: org, role: 'member', orgShellEnabled: true })).toEqual(['home', 'chat', 'profile']);
  });

  it('treats a not-yet-loaded role like a member (no analytics flash)', () => {
    expect(shellTabsFor({ account: org, role: null, orgShellEnabled: true })).toEqual(['home', 'chat', 'profile']);
  });

  it('falls back to the citizen shell when the kill switch is off', () => {
    expect(shellTabsFor({ account: org, role: 'owner', orgShellEnabled: false })).toEqual([
      'home',
      'explore',
      'profile',
    ]);
  });
});

describe('landingTabAfterSwitch', () => {
  it('lands on Profil', () => {
    expect(landingTabAfterSwitch(['home', 'chat', 'profile'])).toBe('profile');
  });
  it('falls back to the first tab when there is no Profil', () => {
    expect(landingTabAfterSwitch(['home', 'chat'])).toBe('home');
  });
});

describe('isTabInShell', () => {
  it('knows which tabs belong to the shell', () => {
    expect(isTabInShell('dashboard', ['home', 'explore', 'profile'])).toBe(false);
    expect(isTabInShell('chat', ['home', 'chat', 'profile'])).toBe(true);
  });
});
