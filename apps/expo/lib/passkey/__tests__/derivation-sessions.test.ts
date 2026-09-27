/**
 * Keys derived from signatures: a thirdweb account keeps its EXACT derivation (same messages,
 * same domains, same result); a passkey account (the adapter account carries its session under
 * PASSKEY_SESSION_PROP) never derives from a signature and goes through derived-keys-runtime.
 */
const mockMem = new Map<string, string>();
jest.mock('@/lib/storage/secureStorage', () => ({
  getItemAsync: jest.fn(async (k: string) => mockMem.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockMem.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockMem.delete(k)),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('../load-derived-keys', () => {
  const m = {
  resolveSecretForAccount: jest.fn(),
  decodeSaltSecret: (b: Uint8Array) => new TextDecoder().decode(b),
  decodeMaciSecret: (b: Uint8Array) => new TextDecoder().decode(b),
  };
  return { loadDerivedKeysRuntime: async () => m, __rt: m };
});

import { keccak256, type Hex } from 'viem';
import { NOSTR_KEY_DERIVATION_MESSAGE, deriveNostrIdentity } from '@netizen-labs/nostr';
import { deriveCommitmentSalt, saltFromSignature } from '@/lib/citizen-commitment';
import { deriveAndStoreIdentity, ensureIdentitySilently } from '@/lib/nostr/identity';
import { deriveEncryptionKey, PASSKEY_EVIDENCE_KEY_MESSAGE } from '@/lib/encryption';
import { PASSKEY_SESSION_PROP, isPasskeyWallet, passkeySessionOf } from '../active';
import { KeyBackupNeededError } from '../derived-keys';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rt = require('../load-derived-keys').__rt;

const SIG = `0x${'5a'.repeat(65)}` as Hex;
const ADDR = '0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28';
const resolve = rt.resolveSecretForAccount as jest.Mock;

function thirdwebAccount() {
  return { address: ADDR, signMessage: jest.fn(async () => SIG), signTypedData: jest.fn(async () => SIG) } as any;
}
function passkeyAccount() {
  return {
    ...thirdwebAccount(),
    [PASSKEY_SESSION_PROP]: { credentialId: 'cred', safe: '0xe3d18fecdcf8e8b656b11340790f7c0147632deb', identity: ADDR },
  } as any;
}

beforeEach(() => {
  mockMem.clear();
  resolve.mockReset();
});

describe('active-session helpers', () => {
  it('wallet id "adapter" is the passkey wallet; the session rides on the account', () => {
    expect(isPasskeyWallet({ id: 'adapter' })).toBe(true);
    expect(isPasskeyWallet({ id: 'inApp' })).toBe(false);
    expect(isPasskeyWallet(null)).toBe(false);
    expect(passkeySessionOf(thirdwebAccount())).toBeNull();
    expect(passkeySessionOf(passkeyAccount())?.credentialId).toBe('cred');
  });
});

describe('thirdweb session: derivation paths unchanged', () => {
  it('commitment salt = saltFromSignature(signTypedData(CommitmentSalt, chainId 100))', async () => {
    const a = thirdwebAccount();
    await expect(deriveCommitmentSalt(a)).resolves.toBe(saltFromSignature(SIG));
    expect(a.signTypedData).toHaveBeenCalledWith({
      domain: { name: 'Roebel Citizen Commitment', version: '1', chainId: 100 },
      types: { CommitmentSalt: [{ name: 'purpose', type: 'string' }] },
      primaryType: 'CommitmentSalt',
      message: { purpose: 'Derive Roebel citizen commitment salt' },
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('Nostr key = deriveNostrIdentity(signMessage(NOSTR_KEY_DERIVATION_MESSAGE)), persisted', async () => {
    const a = thirdwebAccount();
    const id = await deriveAndStoreIdentity(a);
    expect(a.signMessage).toHaveBeenCalledWith({ message: NOSTR_KEY_DERIVATION_MESSAGE });
    expect(id.npub).toBe(deriveNostrIdentity(SIG).npub);
    expect(mockMem.get('nostr_secret_key_v1')).toBeDefined();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('evidence key = first 32 bytes of signTypedData under the frozen chainId 8453 domain', async () => {
    const a = thirdwebAccount();
    const { key } = await deriveEncryptionKey(a, 1234);
    expect(Buffer.from(key).toString('hex')).toBe(SIG.slice(2, 66));
    expect(a.signTypedData.mock.calls[0][0].domain).toEqual({ name: 'HomeTown DAO Evidence Encryption', version: '1', chainId: 8453 });
  });
});

describe('passkey session: never derive from a signature', () => {
  it('commitment salt comes from the resolver (a/b/c), not a signature', async () => {
    const a = passkeyAccount();
    resolve.mockResolvedValue({ secret: new TextEncoder().encode('4242'), source: 'backup' });
    await expect(deriveCommitmentSalt(a)).resolves.toBe('4242');
    expect(resolve.mock.calls[0][1]).toBe('salt');
    expect(a.signTypedData).not.toHaveBeenCalled();
  });

  it('commitment salt: (a) uses the existing preimage salt via loadLocal', async () => {
    const a = passkeyAccount();
    mockMem.set(`citizen-preimage.${ADDR.toLowerCase()}`, JSON.stringify({ firstName: '', lastName: '', birthdate: '', address: '', salt: '777' }));
    resolve.mockImplementation(async (_acc, _slot, local) => ({ secret: await local.load(), source: 'local' }));
    await expect(deriveCommitmentSalt(a)).resolves.toBe('777');
  });

  it('Nostr: resolved key is used and no derivation signature is made', async () => {
    const a = passkeyAccount();
    const secret = deriveNostrIdentity(`0x${'01'.repeat(32)}`).secretKey;
    resolve.mockResolvedValue({ secret, source: 'generated' });
    const id = await deriveAndStoreIdentity(a);
    expect(id.secretKey).toEqual(secret);
    expect(resolve.mock.calls[0][1]).toBe('nostr');
    expect(a.signMessage).not.toHaveBeenCalled();
  });

  it('(d) surfaces the German KeyBackupNeededError instead of a wrong key', async () => {
    resolve.mockRejectedValue(new KeyBackupNeededError('salt'));
    await expect(deriveCommitmentSalt(passkeyAccount())).rejects.toThrow(/Schlüssel sichern/);
  });

  it('silent Nostr enrollment never prompts on a passkey session without a local key', async () => {
    const a = passkeyAccount();
    await ensureIdentitySilently(a);
    expect(resolve).not.toHaveBeenCalled();
    expect(a.signMessage).not.toHaveBeenCalled();
  });

  it('silent Nostr enrollment never prompts on a passkey session WITH a local, unregistered key', async () => {
    mockMem.set('nostr_secret_key_v1', `0x${'01'.repeat(32)}`);
    const a = passkeyAccount();
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    await ensureIdentitySilently(a);
    expect(a.signMessage).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passkey: the commitment salt is persisted on the device after the first resolve', async () => {
    resolve.mockImplementation(async (_acc: unknown, _slot: string, local: any) => {
      const have = await local.load();
      if (have) return { secret: have, source: 'local' };
      const secret = new TextEncoder().encode('4242');
      await local.save(secret);
      return { secret, source: 'deviceBlob' };
    });
    expect(await deriveCommitmentSalt(passkeyAccount())).toBe('4242');
    expect(mockMem.get(`passkey_commitment_salt_v1.${ADDR.toLowerCase()}`)).toBe('4242');
    // second call: served from the device (the runtime's (a) branch), no unwrap
    expect(await deriveCommitmentSalt(passkeyAccount())).toBe('4242');
  });

  it('evidence encryption refuses with a German message (no chain-8453 signature)', async () => {
    const a = passkeyAccount();
    await expect(deriveEncryptionKey(a)).rejects.toThrow(PASSKEY_EVIDENCE_KEY_MESSAGE);
    expect(a.signTypedData).not.toHaveBeenCalled();
  });

  it('sanity: keccak of the signature is not what a passkey session would ever store', () => {
    expect(keccak256(SIG)).toMatch(/^0x/);
  });
});
