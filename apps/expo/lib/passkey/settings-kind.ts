/**
 * Which "Passkey & Wiederherstellung" screen a person gets.
 *  - sovereign: a passkey session whose identity is the Safe (independent account).
 *  - migration: a thirdweb user moving to a passkey, or someone who already moved (connected record,
 *    or a passkey session on a legacy identity). The latter keep their screen (guardians, warning
 *    email) even when the migration surface is closed in production.
 *  - hidden: nothing to show.
 */
export type SettingsKind = 'sovereign' | 'migration' | 'hidden';

export function settingsKind(p: {
  passkeySession: boolean;
  identityIsSafe: boolean;
  hasRecord: boolean;
  recordConnected: boolean;
  signupOpen: boolean;
  migrationOpen: boolean;
}): SettingsKind {
  if (!p.signupOpen) return 'hidden';
  if (p.passkeySession && p.identityIsSafe) return 'sovereign';
  if (p.recordConnected || p.passkeySession) return 'migration';
  return p.migrationOpen ? 'migration' : 'hidden';
}
