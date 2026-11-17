jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) => require('node:crypto').createHash('sha256').update(s).digest('hex'),
  getRandomBytes: (n: number) => new Uint8Array(require('node:crypto').randomBytes(n)),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/constants/gnosis', () => ({ credentialRegistryGnosisAddress: '0x' + '11'.repeat(20), credentialRegistryDeployBlock: 0 }));
jest.mock('thirdweb/react', () => ({ useActiveAccount: () => undefined }));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [null, jest.fn()] }));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(async () => {}), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: jest.fn() }));
jest.mock('@/components/ErrorDrawer', () => () => null);

import type { Hex } from 'viem';
import { parseQRCode } from '@/components/QRScanner';
import type { HeldCredential } from '../held';
import type { InvitationView } from '../types';
import { buildPresentation, newNonce, PresentationError, qrPayload, showCredential, showMessage, SHOW_SCOPE } from '../present';

const ADDR = '0x' + 'AB'.repeat(20);
const tid = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;
const SIG = ('0x' + 'ee'.repeat(65)) as Hex;
const account = () => ({ address: ADDR, signMessage: jest.fn(async () => SIG) });

const claim: InvitationView['claim'] = {
  batchId: '3',
  leaf: { kind: 'account', typeId: tid(7), subject: ADDR.toLowerCase() as any, validUntil: '0', salt: tid(99) },
  proof: [tid(1), tid(2)],
  claimSignature: null,
};

function held(over: Partial<HeldCredential> = {}): HeldCredential {
  return {
    typeId: tid(7),
    kind: 'membership',
    title: 'Mitglied',
    orgName: 'Verein',
    imageUrl: null,
    recognised: false,
    visibility: 'public',
    validUntil: null,
    invitationId: 'inv-1',
    claim,
    ...over,
  };
}

describe('present', () => {
  it('showMessage matches the server format', () => {
    expect(SHOW_SCOPE).toBe('roebel-credential-show-v1');
    expect(showMessage({ typeId: tid(7), account: ADDR, issuedAtSec: 1000, nonce: 'abcdefgh' })).toBe(
      `roebel-credential-show-v1:${tid(7)}:${ADDR.toLowerCase()}:1000:abcdefgh`,
    );
    expect(qrPayload('ABCDEFGHJKMN')).toBe('roebel-ausweis:ABCDEFGHJKMN');
    expect(newNonce()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('buildPresentation leaves out the private part for a public credential', async () => {
    const acc = account();
    const p = await buildPresentation(acc as any, held(), 1000, 'abcdefgh1234');
    expect(p).toEqual({ v: 1, typeId: tid(7), account: ADDR.toLowerCase(), issuedAtSec: 1000, nonce: 'abcdefgh1234', accountSignature: SIG });
    expect('private' in p).toBe(false);
    expect((acc.signMessage.mock.calls[0] as any)[0].message).toBe(showMessage(p));
  });

  it('buildPresentation includes the proof for a private credential', async () => {
    const p = await buildPresentation(account() as any, held({ visibility: 'private' }), 1000, 'abcdefgh1234');
    expect(p.private).toEqual({ batchId: '3', leaf: claim.leaf, proof: claim.proof, claimSignature: null });
  });

  it('buildPresentation refuses a private credential without proof (device cache) and does not sign', async () => {
    const acc = account();
    await expect(buildPresentation(acc as any, held({ visibility: 'private', claim: null }), 1000, 'abcdefgh1234')).rejects.toMatchObject({
      code: 'NEEDS_PROOF',
    });
    await expect(buildPresentation(acc as any, held({ visibility: 'private', claim: null }), 1000, 'abcdefgh1234')).rejects.toBeInstanceOf(
      PresentationError,
    );
    expect(acc.signMessage).not.toHaveBeenCalled();
  });

  it('showCredential refetches mine for a cached private credential, or asks to go online', async () => {
    const acc = account();
    const inv = { id: 'inv-1', state: 'accepted', type: { typeId: tid(7) }, claim } as unknown as InvitationView;
    const create = jest.fn(async (_a: unknown, p: any) => ({ ok: true as const, data: { code: 'ABCDEFGHJKMN', expiresAt: 'x', p } }));
    const fetchMine = jest.fn(async () => ({ ok: true as const, data: [inv] }));
    const r = await showCredential(acc as any, held({ visibility: 'private', claim: null }), { fetchMine, create, nowSec: () => 1000 });
    expect(r).toMatchObject({ ok: true, code: 'ABCDEFGHJKMN', expiresAtSec: 1300 });
    expect((create.mock.calls[0] as any)[1].private.proof).toEqual(claim.proof);

    const offline = jest.fn(async () => ({ ok: false as const, code: 'NETWORK_ERROR', message: 'x' }));
    const r2 = await showCredential(acc as any, held({ visibility: 'private', claim: null }), { fetchMine: offline, create, nowSec: () => 1000 });
    expect(r2).toEqual({ ok: false, message: expect.stringMatching(/Verbindung/) });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('the scanner recognises roebel-ausweis:<code>', () => {
    expect(parseQRCode('roebel-ausweis:ABCDEFGHJKMN')).toMatchObject({ type: 'credential', id: 'ABCDEFGHJKMN' });
    expect(parseQRCode('roebel-ausweis:abcdefghjkmn')).toMatchObject({ type: 'credential', id: 'ABCDEFGHJKMN' });
    expect(parseQRCode('roebel-ausweis:SHORT').type).toBe('unknown');
    expect(parseQRCode('roebel-ausweis:ABCDEFGHJKM1').type).toBe('unknown'); // 1 is not in the code alphabet
  });
});
