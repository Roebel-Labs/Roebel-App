jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { decodeFunctionData, getAddress, type Address, type Hex } from 'viem';
import {
  buildCreateLegacyAccountCall,
  buildMigrationV3Calls,
  buildMoveToCalls,
  isV3Enabled,
  needsLegacyDeploy,
  parseV3Config,
  predictLegacyAccount,
  readIdentityTokens,
} from '../migration-v3';
import { CITIZEN_NFT_V2, THIRDWEB_ACCOUNT_FACTORY } from '../constants';

const LEGACY: Address = '0xEbf3C1694FBD80b1a7ab8F82e19A1291Cd795227'; // real counterfactual v2 citizen
const ADMIN: Address = '0x21e70901AbC2656641d08F4eB326484b5Df50e90'; // its admin EOA (read from Base)
const SAFE: Address = '0x417979e5F0B2281C4f1C64Ab18E772d1A50dBc98';
const V3C: Address = '0x3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c';
const V3A: Address = '0xa7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7';
const HANDOVER = { to: LEGACY, data: '0x5892e236' as Hex };

const executeAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 't', type: 'address' },
      { name: 'v', type: 'uint256' },
      { name: 'd', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;
const moveToAbi = [
  { type: 'function', name: 'moveTo', stateMutability: 'nonpayable', inputs: [{ name: 'a', type: 'address' }], outputs: [] },
] as const;

describe('migration-v3 — encoders', () => {
  it('buildMoveToCalls = legacy.execute(v3, 0, moveTo(safe))', () => {
    const [call] = buildMoveToCalls(LEGACY, V3C, SAFE);
    expect(call.to).toBe(LEGACY);
    const outer = decodeFunctionData({ abi: executeAbi, data: call.data });
    expect(outer.args[0].toLowerCase()).toBe(V3C);
    expect(outer.args[1]).toBe(0n);
    expect(outer.args[2].slice(0, 10)).toBe('0xbd923581');
    expect(decodeFunctionData({ abi: moveToAbi, data: outer.args[2] }).args[0]).toBe(SAFE);
  });

  it('buildCreateLegacyAccountCall = AccountFactory.createAccount(admin, 0x)', () => {
    const c = buildCreateLegacyAccountCall(ADMIN);
    expect(c.to).toBe(THIRDWEB_ACCOUNT_FACTORY);
    expect(c.data.slice(0, 10)).toBe('0xd8fd8f44');
  });

  it('buildMigrationV3Calls orders createAccount → handover → moves', () => {
    const v3 = { citizenNft: V3C, attesterNft: V3A };
    const calls = buildMigrationV3Calls({
      legacy: LEGACY,
      safe: SAFE,
      adminEoa: ADMIN,
      needsDeploy: true,
      handover: HANDOVER,
      moveCitizen: true,
      moveAttester: true,
      v3,
    });
    expect(calls.map((c) => c.to)).toEqual([THIRDWEB_ACCOUNT_FACTORY, LEGACY, LEGACY, LEGACY]);
    expect(calls[1]).toBe(HANDOVER);
    // Already admin + deployed: only the move.
    expect(buildMigrationV3Calls({ legacy: LEGACY, safe: SAFE, needsDeploy: false, moveCitizen: true, moveAttester: false, v3 })).toHaveLength(1);
  });

  it('buildMigrationV3Calls refuses unsafe / impossible batches', () => {
    const base = { legacy: LEGACY, safe: SAFE, moveCitizen: true, moveAttester: false, v3: { citizenNft: V3C } };
    expect(() => buildMigrationV3Calls({ ...base, needsDeploy: true, handover: HANDOVER })).toThrow(/adminEoa/);
    expect(() => buildMigrationV3Calls({ ...base, needsDeploy: true, adminEoa: ADMIN })).toThrow(/handover/);
    expect(() => buildMigrationV3Calls({ ...base, needsDeploy: false, moveAttester: true })).toThrow(/AttesterNFTv3/);
    expect(() => buildMigrationV3Calls({ ...base, needsDeploy: false, v3: {} })).toThrow(/CitizenNFTv3/);
    expect(() => buildMigrationV3Calls({ ...base, needsDeploy: false, moveCitizen: false })).toThrow(/nothing/);
  });

  it('v3 config: empty or malformed env = off', () => {
    expect(parseV3Config('', '')).toEqual({ citizenNft: undefined, attesterNft: undefined });
    expect(parseV3Config('0x12', V3A)).toEqual({ citizenNft: undefined, attesterNft: getAddress(V3A) });
    // Any casing of a valid address is normalized to the checksum form.
    expect(parseV3Config(V3C.toUpperCase().replace('0X', '0x'), '').citizenNft).toBe(getAddress(V3C));
    expect(isV3Enabled(parseV3Config('', V3A))).toBe(false);
    expect(isV3Enabled(parseV3Config(V3C, ''))).toBe(true);
    // Unset in the test env.
    expect(isV3Enabled()).toBe(false);
  });
});

describe('migration-v3 — reads', () => {
  it('needsLegacyDeploy / predictLegacyAccount / readIdentityTokens', async () => {
    const client = {
      getCode: jest.fn(async ({ address }: { address: Address }) => (address === LEGACY ? undefined : ('0x6080' as Hex))),
      readContract: jest.fn(async ({ address, functionName, args }: any) => {
        if (address === THIRDWEB_ACCOUNT_FACTORY) {
          expect(functionName).toBe('getAddress');
          expect(args).toEqual([ADMIN, '0x']);
          return LEGACY;
        }
        if (address === CITIZEN_NFT_V2) return true;
        if (address === V3C) return false;
        if (address === V3A) return functionName === 'hasAttesterNFT';
        throw new Error('unexpected');
      }),
    };
    expect(await needsLegacyDeploy(LEGACY, client)).toBe(true);
    expect(await needsLegacyDeploy(SAFE, client)).toBe(false);
    expect(await predictLegacyAccount(ADMIN, client)).toBe(LEGACY);
    expect(await readIdentityTokens(LEGACY, { citizenNft: V3C, attesterNft: V3A }, client)).toEqual({
      citizenV2: true,
      citizenV3: false,
      attesterV3: true,
    });
    // v3 unset: only v2 is read.
    client.readContract.mockClear();
    expect(await readIdentityTokens(LEGACY, {}, client)).toEqual({ citizenV2: true, citizenV3: false, attesterV3: false });
    expect(client.readContract).toHaveBeenCalledTimes(1);
  });
});
