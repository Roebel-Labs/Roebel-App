/**
 * Which "Passkey & Wiederherstellung" screen a person gets.
 *  - sovereign: a passkey session whose identity is the Safe (independent account).
 *  - migration: a thirdweb user moving to a passkey, or someone who already moved (connected record,
 *    or a passkey session on a legacy identity). The latter keep their screen (guardians, warning
 *    email) even when the migration surface is closed in production.
 *  - hidden: nothing to show.
 *
 * An EXISTING account (passkey session or connected record) is decided by the channel fence only
 * (passkeyChannelAllowed): turning sign-up or the kill switch off must never hide guardians, the
 * warning email or the recovery banner from it. Everyone else needs the sign-up surface open.
 */
export type SettingsKind = 'sovereign' | 'migration' | 'hidden';

export function settingsKind(p: {
  passkeySession: boolean;
  identityIsSafe: boolean;
  hasRecord: boolean;
  recordConnected: boolean;
  /** passkeyChannelAllowed(): the only fence for an existing account. */
  channelAllowed: boolean;
  signupOpen: boolean;
  migrationOpen: boolean;
}): SettingsKind {
  if (p.passkeySession || p.recordConnected) {
    if (!p.channelAllowed) return 'hidden';
    return p.passkeySession && p.identityIsSafe ? 'sovereign' : 'migration';
  }
  if (!p.signupOpen) return 'hidden';
  return p.migrationOpen ? 'migration' : 'hidden';
}
