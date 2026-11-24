/**
 * Which sections the bottom bar shows for the active account.
 *
 *   personal (or nothing loaded yet)  Austausch · Erkunden · Profil
 *   org, Inhaber/Admin                Austausch · Dashboard · Chat · Profil
 *   org, Mitglied (or role loading)   Austausch · Chat · Profil
 *
 * `org_shell_enabled = false` in app_settings sends everyone back to the citizen shell.
 */
import type { MainTab } from './goToTab';
import type { AccountRole } from '../supabase-account-roles';
import { isOrgAccount, type Account } from '../types';

const CITIZEN_SHELL: MainTab[] = ['home', 'explore', 'profile'];
const ORG_SHELL: MainTab[] = ['home', 'dashboard', 'chat', 'profile'];
const ORG_MEMBER_SHELL: MainTab[] = ['home', 'chat', 'profile'];

export function shellTabsFor(input: {
  account: Account | null;
  role: AccountRole | null;
  orgShellEnabled: boolean;
}): MainTab[] {
  if (!input.orgShellEnabled || !isOrgAccount(input.account)) return [...CITIZEN_SHELL];
  return input.role === 'owner' || input.role === 'admin' ? [...ORG_SHELL] : [...ORG_MEMBER_SHELL];
}

/** After an account switch the user lands on Profil (the switch pill lives there). */
export function landingTabAfterSwitch(tabs: MainTab[]): MainTab {
  return tabs.includes('profile') ? 'profile' : tabs[0] ?? 'home';
}

export function isTabInShell(tab: MainTab, tabs: MainTab[]): boolean {
  return tabs.includes(tab);
}
