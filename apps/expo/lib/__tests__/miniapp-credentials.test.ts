/**
 * Held-credentials adapter for mini-app matching: built-ins from the user, register holdings
 * (public and private) with their org from the public type directory.
 */
const mockEnv = {
  gate: false as boolean | null,
  held: [] as { typeId: string; validUntil: number | null }[],
  user: { isCitizen: false, isConnected: true, isLoading: false },
  directory: jest.fn(async () => null as { typeId: string; orgAccountId: string | null }[] | null),
};
jest.mock('@/lib/credreg/gate', () => ({ useCredentialsGate: () => mockEnv.gate }));
// A fresh array on every render, exactly like the real useHeld when nothing is held.
jest.mock('@/lib/credreg/held', () => ({
  useHeld: () => ({ held: [...mockEnv.held], loading: false }),
  loadTypeDirectory: () => mockEnv.directory(),
}));
jest.mock('@/context/UserContext', () => ({ useUser: () => mockEnv.user }));
jest.mock('@/context/VerificationContext', () => ({
  useVerificationContext: () => ({ hasAttesterNFT: false, nftStatus: { isLoading: false } }),
}));
jest.mock('@/context/WalletBootContext', () => ({ useWalletBoot: () => ({ autoConnectFinished: true }) }));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { RESERVED_TYPE_IDS } from '@netizen-labs/credential-registry';
import {
  builtinMatchCredentials,
  registerMatchCredentials,
  useMatchCredentials,
  type MatchCredential,
} from '../miniapp-credentials';

const X = '0x' + 'a1'.repeat(32);
const Y = '0x' + 'b2'.repeat(32);
const ORG = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const NOW = 1_800_000_000;

describe('builtinMatchCredentials', () => {
  it('a signed-out person matches nothing', () =>
    expect(builtinMatchCredentials({ signedIn: false, isCitizen: false, isAttester: false })).toEqual([]));
  it('a signed-out citizen flag is ignored too', () =>
    expect(builtinMatchCredentials({ signedIn: false, isCitizen: true, isAttester: true })).toEqual([]));
  it('a guest matches guest only', () =>
    expect(builtinMatchCredentials({ signedIn: true, isCitizen: false, isAttester: false })).toEqual([{ type: 'guest' }]));
  it('a citizen matches citizen, an attester both', () => {
    expect(builtinMatchCredentials({ signedIn: true, isCitizen: true, isAttester: false })).toEqual([{ type: 'citizen' }]);
    expect(builtinMatchCredentials({ signedIn: true, isCitizen: true, isAttester: true })).toEqual([
      { type: 'citizen' },
      { type: 'attester' },
    ]);
  });
});

describe('registerMatchCredentials', () => {
  it('register holdings carry their org, private ones included', () => {
    expect(
      registerMatchCredentials(
        [
          { typeId: X, validUntil: null },
          { typeId: Y, validUntil: null },
        ],
        [
          { typeId: X, orgAccountId: ORG },
          { typeId: Y, orgAccountId: null },
        ],
        NOW,
      ),
    ).toEqual([{ type: 'type:' + X, org: ORG }, { type: 'type:' + Y }]);
  });

  it('matches the directory case-insensitively and lowercases ids', () => {
    expect(
      registerMatchCredentials([{ typeId: X.toUpperCase().replace('0X', '0x'), validUntil: null }], [{ typeId: X, orgAccountId: ORG.toUpperCase() }], NOW),
    ).toEqual([{ type: 'type:' + X, org: ORG }]);
  });

  it('a holding missing from the directory has no org', () => {
    expect(registerMatchCredentials([{ typeId: X, validUntil: null }], [], NOW)).toEqual([{ type: 'type:' + X }]);
  });

  it('expired holdings and reserved type ids are skipped', () => {
    const reserved = Object.values(RESERVED_TYPE_IDS)[0] as string;
    expect(
      registerMatchCredentials(
        [
          { typeId: X, validUntil: NOW - 1 },
          { typeId: Y, validUntil: NOW + 60 },
          { typeId: reserved, validUntil: null },
        ],
        [],
        NOW,
      ),
    ).toEqual([{ type: 'type:' + Y }]);
  });

  it('drops malformed ids and duplicates', () => {
    expect(
      registerMatchCredentials(
        [
          { typeId: 'nope', validUntil: null },
          { typeId: X, validUntil: null },
          { typeId: X, validUntil: null },
        ],
        [],
        NOW,
      ),
    ).toEqual([{ type: 'type:' + X }]);
  });
});

describe('useMatchCredentials', () => {
  let last: { held: MatchCredential[]; ready: boolean } | null = null;
  let renders = 0;
  function Probe() {
    renders++;
    last = useMatchCredentials();
    return null;
  }
  async function mount() {
    last = null;
    renders = 0;
    await act(async () => {
      TestRenderer.create(React.createElement(Probe));
    });
    await act(async () => {});
  }

  it('with the register off: built-ins only, ready at once', async () => {
    mockEnv.gate = false;
    mockEnv.user = { isCitizen: true, isConnected: true, isLoading: false };
    await mount();
    expect(last).toEqual({ held: [{ type: 'citizen' }], ready: true });
  });

  it('with the register on and nothing held: settles without a render loop or a directory fetch', async () => {
    mockEnv.gate = true;
    mockEnv.held = [];
    mockEnv.directory.mockClear();
    await mount();
    expect(last?.ready).toBe(true);
    expect(renders).toBeLessThan(10);
    expect(mockEnv.directory).not.toHaveBeenCalled();
  });

  it('merges register holdings with their org once the directory answered', async () => {
    mockEnv.gate = true;
    mockEnv.user = { isCitizen: false, isConnected: true, isLoading: false };
    mockEnv.held = [{ typeId: X, validUntil: null }];
    mockEnv.directory.mockImplementation(async () => [{ typeId: X, orgAccountId: ORG }]);
    await mount();
    expect(last).toEqual({ held: [{ type: 'guest' }, { type: 'type:' + X, org: ORG }], ready: true });
  });

  it('waits while the register gate is undecided', async () => {
    mockEnv.gate = null;
    await mount();
    expect(last?.ready).toBe(false);
  });
});
