/**
 * The July voting key must be reproduced byte-for-byte, so these tests compare
 * our candidates against thirdweb's OWN smartAccountSignMessage (the code path
 * the app ran in July on Base), in both deployment states.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const thirdwebCjsRoot = path.join(path.dirname(require.resolve('thirdweb')), '..');
const isDeployedPath = path.join(thirdwebCjsRoot, 'utils/bytecode/is-contract-deployed.js');
const verifyHashPath = path.join(thirdwebCjsRoot, 'auth/verify-hash.js');

const mockDeployed = { value: false };
// Stub the two network reads inside thirdweb's own signing path (CJS build).
// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.spyOn(require(isDeployedPath), 'isContractDeployed').mockImplementation(async () => mockDeployed.value);
// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.spyOn(require(verifyHashPath), 'verifyEip1271Signature').mockImplementation(async () => true);

import { createThirdwebClient, getContract } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { DEFAULT_ACCOUNT_FACTORY_V0_6 } from 'thirdweb/wallets/smart';
import {
  buildLegacySignatureCandidates,
  connectLegacyBaseSigner,
  seedFromSignature,
} from '../maci-legacy-key';

// thirdweb/wallets resolves to an untransformed ESM build under jest-expo,
// so load the CJS private-key account directly.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { privateKeyToAccount } = require(path.join(thirdwebCjsRoot, 'wallets/private-key.js'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { smartAccountSignMessage } = require(path.join(thirdwebCjsRoot, 'wallets/smart/lib/signing.js'));

const client = createThirdwebClient({ clientId: 'test' });
const admin = privateKeyToAccount({
  client,
  privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
});
const SMART = '0x1111111111111111111111111111111111111111';
const MESSAGE = 'Röbel Bürgerumfrage – Abstimmungsschlüssel v1';

async function thirdwebJulySignature(deployed: boolean) {
  mockDeployed.value = deployed;
  return smartAccountSignMessage({
    accountContract: getContract({ client, chain: base, address: SMART }),
    factoryContract: getContract({ client, chain: base, address: DEFAULT_ACCOUNT_FACTORY_V0_6 }),
    options: { personalAccount: admin, chain: base, client },
    message: MESSAGE,
  });
}

describe('buildLegacySignatureCandidates', () => {
  it('matches thirdweb smartAccountSignMessage on Base for both deployment states', async () => {
    const [raw, wrapped] = await buildLegacySignatureCandidates({
      client,
      admin,
      smartAccountAddress: SMART,
      message: MESSAGE,
    });
    expect(raw).toBe(await thirdwebJulySignature(true));
    expect(wrapped).toBe(await thirdwebJulySignature(false));
    expect(seedFromSignature(raw)).not.toBe(seedFromSignature(wrapped));
  });

  it('differs from the Gnosis (chain 100) signature — the root cause', async () => {
    const [raw] = await buildLegacySignatureCandidates({ client, admin, smartAccountAddress: SMART, message: MESSAGE });
    mockDeployed.value = true;
    const gnosisSig = await smartAccountSignMessage({
      accountContract: getContract({ client, chain: { ...base, id: 100 }, address: SMART }),
      factoryContract: getContract({ client, chain: { ...base, id: 100 }, address: DEFAULT_ACCOUNT_FACTORY_V0_6 }),
      options: { personalAccount: admin, chain: { ...base, id: 100 }, client },
      message: MESSAGE,
    });
    expect(raw).not.toBe(gnosisSig);
  });
});

describe('connectLegacyBaseSigner', () => {
  it('only autoConnects the Base wallet — never connect() or setActiveWallet', async () => {
    const setActiveWallet = jest.fn();
    const wallet = {
      autoConnect: jest.fn(async () => ({ address: SMART })),
      connect: jest.fn(),
      getAdminAccount: () => admin,
    };
    const out = await connectLegacyBaseSigner({
      client,
      createWallet: () => wallet as any,
    });
    expect(out).toEqual({ admin, smartAccountAddress: SMART });
    expect(wallet.autoConnect).toHaveBeenCalledWith({ client });
    expect(wallet.connect).not.toHaveBeenCalled();
    expect(setActiveWallet).not.toHaveBeenCalled();
  });

  it('throws (→ retryable unknown) when there is no admin account', async () => {
    await expect(
      connectLegacyBaseSigner({
        client,
        createWallet: () => ({ autoConnect: async () => ({ address: SMART }), getAdminAccount: () => undefined }) as any,
      }),
    ).rejects.toThrow();
  });

  it('neither the lib nor MaciContext ever calls setActiveWallet', () => {
    for (const rel of ['../maci-legacy-key.ts', '../../context/MaciContext.tsx']) {
      // Strip comments: only real calls count.
      const src = fs
        .readFileSync(path.join(__dirname, rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src).not.toMatch(/setActiveWallet\s*\(/);
      expect(src).not.toMatch(/useSetActiveWallet|useConnect\b/);
    }
  });
});
