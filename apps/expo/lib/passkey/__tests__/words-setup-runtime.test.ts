/**
 * wordsPoolView (the guardian list's words view) wires the 'words' gate and the promptless backup
 * read into currentWordsPool (N2 refined): closed gate → none, open gate + no token → unknown,
 * open gate + a token read showing words off → none.
 */
import type { Address } from 'viem';

const mockKv = new Map<string, string>();
const mockGate = { open: false, calls: 0 };
const mockRemote: { read: jest.Mock; write: jest.Mock; readWithoutPrompt: jest.Mock } = {
  read: jest.fn(),
  write: jest.fn(),
  readWithoutPrompt: jest.fn(async () => null),
};

jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));
jest.mock('../gate', () => ({
  isPasskeySurfaceAllowed: async (surface: string) => {
    mockGate.calls++;
    return surface === 'words' && mockGate.open;
  },
}));
jest.mock('../derived-keys-runtime', () => ({
  deviceSecretSources: () => [],
  keyBackupFor: () => mockRemote,
  wordsVaultKeyStorage: {},
}));
jest.mock('../detach-runtime', () => ({ actingPasskeySession: async (s: unknown) => s }));
jest.mock('../guardians-runtime', () => ({
  readGuardianState: jest.fn(),
  readIdentityMode: jest.fn(),
  sendOwnSafeOp: jest.fn(),
  recoveryStorage: {
    getItem: async (k: string) => mockKv.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockKv.set(k, v),
    removeItem: async (k: string) => void mockKv.delete(k),
  },
}));
jest.mock('../webauthn', () => ({ getPrfSecret: jest.fn(), signWithPasskey: jest.fn() }));

import { PASSKEY_SESSION_PROP } from '../active';
import { WORDS_OFF_BLOB } from '../words-vault';
import { wordsPoolView } from '../words-setup-runtime';

const P1 = '0x1111111111111111111111111111111111111111' as Address;
const SAFE = '0x5afe00000000000000000000000000000000beef' as Address;
const account = { address: SAFE, [PASSKEY_SESSION_PROP]: { credentialId: 'c', safe: SAFE, identity: SAFE } };

beforeEach(() => {
  mockKv.clear();
  mockGate.open = false;
  mockGate.calls = 0;
  mockRemote.readWithoutPrompt.mockReset().mockResolvedValue(null);
});

describe('wordsPoolView', () => {
  it('words gate closed: none, and no backup read', async () => {
    expect(await wordsPoolView([P1], account)).toEqual({ pool: null, state: 'none' });
    expect(mockGate.calls).toBe(1);
    expect(mockRemote.readWithoutPrompt).not.toHaveBeenCalled();
  });

  it('words gate open, no cached token: unknown (changes refused until "Angaben laden")', async () => {
    mockGate.open = true;
    expect(await wordsPoolView([P1], account)).toEqual({ pool: null, state: 'unknown' });
    expect(mockRemote.readWithoutPrompt).toHaveBeenCalledTimes(1);
  });

  it('words gate open, a token read shows the words off: none', async () => {
    mockGate.open = true;
    mockRemote.readWithoutPrompt.mockResolvedValue({ status: 'found', blobs: { wvk: WORDS_OFF_BLOB } });
    expect(await wordsPoolView([P1], account)).toEqual({ pool: null, state: 'none' });
  });

  it('words gate open, key backup disabled: none', async () => {
    mockGate.open = true;
    mockRemote.readWithoutPrompt.mockResolvedValue({ status: 'disabled' });
    expect(await wordsPoolView([P1], account)).toEqual({ pool: null, state: 'none' });
  });
});
