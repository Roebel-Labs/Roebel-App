import { settingsKind } from '../settings-kind';

const base = {
  passkeySession: false,
  identityIsSafe: false,
  hasRecord: false,
  recordConnected: false,
  channelAllowed: true,
  signupOpen: true,
  migrationOpen: false,
};

describe('settingsKind', () => {
  it('closed sign-up surface hides everything from someone without an account', () => {
    expect(settingsKind({ ...base, signupOpen: false })).toBe('hidden');
    expect(settingsKind({ ...base, signupOpen: false, migrationOpen: true })).toBe('hidden');
    expect(settingsKind({ ...base, signupOpen: false, hasRecord: true, recordConnected: false })).toBe('hidden');
  });
  it('closed sign-up (or kill switch) keeps the screen of an EXISTING account', () => {
    expect(settingsKind({ ...base, signupOpen: false, passkeySession: true, identityIsSafe: true })).toBe('sovereign');
    expect(settingsKind({ ...base, signupOpen: false, passkeySession: true, identityIsSafe: false })).toBe('migration');
    expect(settingsKind({ ...base, signupOpen: false, hasRecord: true, recordConnected: true })).toBe('migration');
  });
  it('an existing account is hidden only when the channel fence is closed', () => {
    expect(settingsKind({ ...base, channelAllowed: false, passkeySession: true, identityIsSafe: true })).toBe('hidden');
    expect(settingsKind({ ...base, channelAllowed: false, hasRecord: true, recordConnected: true })).toBe('hidden');
  });
  it('a passkey-only person sees the sovereign settings', () =>
    expect(settingsKind({ ...base, passkeySession: true, identityIsSafe: true })).toBe('sovereign'));
  it('a thirdweb user sees nothing while migration is closed', () => expect(settingsKind(base)).toBe('hidden'));
  it('a thirdweb user sees the migration when it is open', () =>
    expect(settingsKind({ ...base, migrationOpen: true })).toBe('migration'));
  it('someone who already moved keeps their screen with migration closed', () => {
    expect(settingsKind({ ...base, hasRecord: true, recordConnected: true })).toBe('migration');
    expect(settingsKind({ ...base, passkeySession: true, identityIsSafe: false })).toBe('migration');
  });
  it('a record that is not connected yet does not open a closed migration', () =>
    expect(settingsKind({ ...base, hasRecord: true, recordConnected: false })).toBe('hidden'));
});
