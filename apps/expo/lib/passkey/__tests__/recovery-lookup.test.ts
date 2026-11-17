import { getAddress, pad, type Address, type Hex } from 'viem';
import {
  SAFE_4337_MODULE,
  SAFE_FALLBACK_HANDLER_SLOT,
  SAFE_L2_SINGLETON,
  SAFE_PROXY_RUNTIME_CODE,
  SOCIAL_RECOVERY_MODULE,
} from '../constants';
import { reverted, shapeClient } from '../__testutils__/lookup-client';
import { blockWindows, scanLogs } from '../log-scan';
import {
  createLookupChain,
  currentAdminsFromLogs,
  findLinkedLegacies,
  findLinkedSafes,
  findRecoverableAccounts,
  findSafesByOwner,
  isContractRevert,
  resolveGuardianAddress,
  suggestDefaultGuardians,
  type AdminLog,
  type LookupChain,
  type SuggestChain,
} from '../recovery-lookup';

const addr = (n: number) => getAddress(`0x${n.toString(16).padStart(40, '0')}`);
const LEGACY = addr(0x1e);
const EOA = addr(0xe0);
const SAFE = addr(0x5a);
const SAFE2 = addr(0x5b);
const ATT1 = addr(0xa1);
const ATT2 = addr(0xa2);
const ATT_SAFE = addr(0xa5);
const CIT = addr(0xc1);

let li = 0;
const log = (emitter: Address, signer: Address, isAdmin: boolean, blockNumber: bigint): AdminLog => ({
  emitter,
  signer,
  isAdmin,
  blockNumber,
  logIndex: li++,
});

function fakeChain(p: {
  adminLogs?: AdminLog[];
  admins?: Array<[Address, Address]>;
  guardians?: Record<string, Address[]>;
  code?: Address[];
}): LookupChain {
  const logs = p.adminLogs ?? [];
  const isAdminSet = new Set((p.admins ?? []).map(([a, s]) => `${a}|${s}`.toLowerCase()));
  return {
    adminLogsOf: jest.fn(async (account: Address) => logs.filter((l) => l.emitter === account)),
    adminLogsFor: jest.fn(async (signer: Address) => logs.filter((l) => l.signer === signer)),
    isAdmin: jest.fn(async (a: Address, s: Address) => isAdminSet.has(`${a}|${s}`.toLowerCase())),
    readGuardians: jest.fn(async (s: Address) => p.guardians?.[s] ?? []),
    hasCode: jest.fn(async (a: Address) => (p.code ?? []).includes(a)),
    ownerLogsFor: jest.fn(async () => []),
    readOwners: jest.fn(async () => []),
    isPasskeySafe: jest.fn(async () => false),
  };
}

describe('log-scan', () => {
  it('splits a range into capped windows, forward and backward', () => {
    expect(blockWindows(0n, 9n, 4n)).toEqual([
      { fromBlock: 0n, toBlock: 3n },
      { fromBlock: 4n, toBlock: 7n },
      { fromBlock: 8n, toBlock: 9n },
    ]);
    expect(blockWindows(0n, 9n, 4n, true)).toEqual([
      { fromBlock: 6n, toBlock: 9n },
      { fromBlock: 2n, toBlock: 5n },
      { fromBlock: 0n, toBlock: 1n },
    ]);
    expect(blockWindows(5n, 4n, 4n)).toEqual([]);
  });

  it('scanLogs stops early once `stop` is satisfied', async () => {
    const windows = blockWindows(0n, 99n, 10n, true);
    const fetch = jest.fn(async (w: { fromBlock: bigint }) => (w.fromBlock === 80n ? ['hit'] : []));
    const out = await scanLogs(windows, fetch, { concurrency: 1, stop: (l) => l.length > 0 });
    expect(out).toEqual(['hit']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('admin links', () => {
  it('currentAdminsFromLogs takes the last event per signer', () => {
    const logs = [log(LEGACY, SAFE, true, 1n), log(LEGACY, SAFE2, true, 2n), log(LEGACY, SAFE2, false, 3n)];
    expect(currentAdminsFromLogs(logs)).toEqual([SAFE]);
  });

  it('findLinkedSafes keeps contract admins that are still admin on chain', async () => {
    const chain = fakeChain({
      adminLogs: [log(LEGACY, EOA, true, 1n), log(LEGACY, SAFE, true, 5n), log(LEGACY, SAFE2, true, 6n)],
      admins: [
        [LEGACY, EOA],
        [LEGACY, SAFE],
      ],
      code: [SAFE, SAFE2],
    });
    expect(await findLinkedSafes(LEGACY, chain)).toEqual([SAFE]);
  });

  it('findLinkedLegacies finds the emitters that name the Safe', async () => {
    const chain = fakeChain({ adminLogs: [log(LEGACY, SAFE, true, 5n)], admins: [[LEGACY, SAFE]] });
    expect(await findLinkedLegacies(SAFE, chain)).toEqual([LEGACY]);
  });
});

describe('findRecoverableAccounts', () => {
  it('legacy profile → its passkey Safe with guardians, recoveryLegacy = the profile wallet', async () => {
    const chain = fakeChain({
      adminLogs: [log(LEGACY, EOA, true, 1n), log(LEGACY, SAFE, true, 5n)],
      admins: [[LEGACY, SAFE]],
      code: [SAFE],
      guardians: { [SAFE]: [ATT1, ATT2] },
    });
    expect(await findRecoverableAccounts(LEGACY, chain)).toEqual([{ wallet: SAFE, recoveryLegacy: LEGACY, guardianCount: 2 }]);
  });

  it('post-v3 profile = the Safe itself (it has guardians)', async () => {
    const chain = fakeChain({ guardians: { [SAFE]: [ATT1] } });
    expect(await findRecoverableAccounts(SAFE, chain)).toEqual([{ wallet: SAFE, recoveryLegacy: null, guardianCount: 1 }]);
  });

  it('drops Safes without guardians and survives read failures', async () => {
    const chain = fakeChain({
      adminLogs: [log(LEGACY, SAFE, true, 5n)],
      admins: [[LEGACY, SAFE]],
      code: [SAFE],
    });
    chain.readGuardians = jest.fn(async () => Promise.reject(new Error('rpc')));
    expect(await findRecoverableAccounts(LEGACY, chain)).toEqual([]);
  });
});

describe('suggestDefaultGuardians', () => {
  function suggestChain(base: LookupChain, approvals: Array<{ approver: Address; signedAsAttester: boolean }> | null): LookupChain & SuggestChain {
    return {
      ...base,
      findMintRequest: jest.fn(async () => (approvals ? { requestId: 7n, createdAt: 1000n, approvals: approvals.length } : null)),
      approvalsOf: jest.fn(async () => approvals ?? []),
    };
  }

  it('attester approvers only, each mapped to its single passkey Safe when it has one', async () => {
    const base = fakeChain({ adminLogs: [log(ATT1, ATT_SAFE, true, 9n)], admins: [[ATT1, ATT_SAFE]], code: [ATT_SAFE] });
    const chain = suggestChain(base, [
      { approver: ATT1, signedAsAttester: true },
      { approver: ATT2, signedAsAttester: true },
      { approver: CIT, signedAsAttester: false },
      { approver: ATT2, signedAsAttester: true },
    ]);
    const s = await suggestDefaultGuardians({ citizen: LEGACY, wallet: SAFE }, chain);
    expect(s).toEqual([
      { approver: ATT1, guardian: ATT_SAFE },
      { approver: ATT2, guardian: ATT2 },
    ]);
    expect(chain.approvalsOf).toHaveBeenCalledWith({ requestId: 7n, createdAt: 1000n, approvals: 4 });
  });

  it('migration-minted citizen (no request) → no suggestion', async () => {
    expect(await suggestDefaultGuardians({ citizen: LEGACY, wallet: SAFE }, suggestChain(fakeChain({}), null))).toEqual([]);
  });

  it('resolveGuardianAddress falls back to the account when it has several Safes', async () => {
    const chain = fakeChain({
      adminLogs: [log(ATT1, SAFE, true, 1n), log(ATT1, SAFE2, true, 2n)],
      admins: [
        [ATT1, SAFE],
        [ATT1, SAFE2],
      ],
      code: [SAFE, SAFE2],
    });
    expect(await resolveGuardianAddress(ATT1, chain)).toBe(ATT1);
  });
});

describe('findSafesByOwner (a recovered Safe from its new owner)', () => {
  const A = addr(0xa0);
  const B = addr(0xb0);
  const C = addr(0xc0);
  const OWNER = addr(0x0e);
  const OTHER = addr(0x0f);

  it('findSafesByOwner keeps only emitters whose single owner is still that owner', async () => {
    const chain = {
      ownerLogsFor: async () => [
        { emitter: A, blockNumber: 5n },
        { emitter: B, blockNumber: 9n },
        { emitter: B, blockNumber: 7n },
      ],
      readOwners: async (s: Address) => (s === B ? [OWNER] : [OTHER]),
      isPasskeySafe: async () => true,
    };
    expect(await findSafesByOwner(OWNER, chain)).toEqual([B]);
  });

  it('newest first, de-duplicated; a co-owned Safe and a reverting emitter are dropped', async () => {
    const chain = {
      ownerLogsFor: async () => [
        { emitter: A, blockNumber: 5n },
        { emitter: B, blockNumber: 9n },
        { emitter: C, blockNumber: 7n },
        { emitter: SAFE, blockNumber: 8n },
        { emitter: A, blockNumber: 6n },
      ],
      readOwners: async (s: Address) => {
        if (s === C) return [OWNER, OTHER];
        if (s === SAFE) throw reverted();
        return [OWNER];
      },
      isPasskeySafe: async () => true,
    };
    expect(await findSafesByOwner(OWNER, chain)).toEqual([B, A]);
  });

  it('a fake that fails the shape check is ignored and does not cause ambiguity', async () => {
    const FAKE = addr(0xfa);
    const chain = {
      ownerLogsFor: async () => [
        { emitter: FAKE, blockNumber: 9n },
        { emitter: B, blockNumber: 7n },
      ],
      readOwners: jest.fn(async () => [OWNER]), // the fake also claims the owner
      isPasskeySafe: async (s: Address) => s === B,
    };
    expect(await findSafesByOwner(OWNER, chain)).toEqual([B]);
    expect(chain.readOwners).not.toHaveBeenCalledWith(FAKE);
  });

  it('a transport error on the owner read is rethrown, never swallowed', async () => {
    const chain = {
      ownerLogsFor: async () => [{ emitter: B, blockNumber: 7n }],
      readOwners: async () => {
        throw new Error('HTTP request failed: timeout');
      },
      isPasskeySafe: async () => true,
    };
    await expect(findSafesByOwner(OWNER, chain)).rejects.toThrow('timeout');
  });

  it('a transport error on the shape check is rethrown; a revert there means "not a Safe"', async () => {
    const logs = async () => [{ emitter: B, blockNumber: 7n }];
    await expect(
      findSafesByOwner(OWNER, {
        ownerLogsFor: logs,
        readOwners: async () => [OWNER],
        isPasskeySafe: async () => {
          throw new Error('fetch failed');
        },
      }),
    ).rejects.toThrow('fetch failed');
    expect(
      await findSafesByOwner(OWNER, {
        ownerLogsFor: logs,
        readOwners: async () => [OWNER],
        isPasskeySafe: async () => {
          throw reverted();
        },
      }),
    ).toEqual([]);
  });

  it('isContractRevert recognises viem revert / zero-data errors anywhere in the cause chain', () => {
    expect(isContractRevert(reverted())).toBe(true);
    expect(isContractRevert(Object.assign(new Error('x'), { name: 'ContractFunctionZeroDataError' }))).toBe(true);
    expect(isContractRevert(new Error('HTTP request failed'))).toBe(false);
    expect(isContractRevert(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe(false);
  });
});

describe('findSafesByOwner over createLookupChain (topic-only AddedOwner is attacker-writable)', () => {
  const OWNER = addr(0x0e);
  const REAL = addr(0x5e);
  const FAKE = addr(0xfa);
  const FAKE_SAFE = addr(0xfb);

  it('a fake emitter in a newer window does not hide the real Safe', async () => {
    const client = shapeClient({
      tip: 1_000n,
      safes: [REAL],
      contracts: [FAKE],
      owners: { [REAL]: [OWNER], [FAKE]: [OWNER] },
      logs: [
        { emitter: FAKE, block: 990n }, // newest window
        { emitter: REAL, block: 300n }, // far older: a later batch
      ],
    });
    const chain = createLookupChain(client as any, { readGuardians: async () => [], range: 50n, passkeyFromBlock: 0n });
    expect(await findSafesByOwner(OWNER, chain)).toEqual([REAL]);
    // the scan went past the first batch (which only held the fake) down to the real Safe's window
    expect(client.getLogs.mock.calls.some(([a]: any) => a.fromBlock <= 300n && 300n <= a.toBlock)).toBe(true);
  });

  it('a fake near the real log is ignored and does not make it ambiguous', async () => {
    const client = shapeClient({
      tip: 1_000n,
      safes: [REAL],
      contracts: [FAKE],
      owners: { [REAL]: [OWNER], [FAKE]: [OWNER] },
      logs: [
        { emitter: FAKE, block: 995n },
        { emitter: REAL, block: 960n },
      ],
    });
    const chain = createLookupChain(client as any, { readGuardians: async () => [], range: 50n, passkeyFromBlock: 0n });
    expect(await findSafesByOwner(OWNER, chain)).toEqual([REAL]);
  });

  it('a valid attacker-built Safe with a much newer log does not stop the scan: both are returned, newest first', async () => {
    const client = shapeClient({
      tip: 1_000n,
      safes: [REAL, FAKE_SAFE],
      owners: { [REAL]: [OWNER], [FAKE_SAFE]: [OWNER] },
      logs: [
        { emitter: FAKE_SAFE, block: 990n }, // newest batch
        { emitter: REAL, block: 100n }, // > one batch (4 x 50 blocks) older
      ],
    });
    const chain = createLookupChain(client as any, { readGuardians: async () => [], range: 50n, passkeyFromBlock: 0n });
    expect(await findSafesByOwner(OWNER, chain)).toEqual([FAKE_SAFE, REAL]);
  });

  it('isPasskeySafe: proxy runtime + SafeL2 singleton + 4337 fallback handler + exactly the two modules', async () => {
    const good = shapeClient({ tip: 0n, safes: [REAL], contracts: [FAKE], owners: {}, logs: [] });
    const chain = createLookupChain(good as any, { readGuardians: async () => [] });
    expect(await chain.isPasskeySafe(REAL)).toBe(true);
    expect(await chain.isPasskeySafe(FAKE)).toBe(false); // other code
    expect(await chain.isPasskeySafe(addr(0x99))).toBe(false); // no code
    const extraModule = shapeClient({
      tip: 0n,
      safes: [FAKE_SAFE],
      owners: {},
      logs: [],
      modules: [SOCIAL_RECOVERY_MODULE, SAFE_4337_MODULE, addr(0xbad)],
    });
    expect(await createLookupChain(extraModule as any, { readGuardians: async () => [] }).isPasskeySafe(FAKE_SAFE)).toBe(false);
    const otherSingleton = shapeClient({ tip: 0n, safes: [FAKE_SAFE], owners: {}, logs: [] });
    otherSingleton.getStorageAt.mockImplementation(async () => pad(addr(0x51), { size: 32 }));
    expect(await createLookupChain(otherSingleton as any, { readGuardians: async () => [] }).isPasskeySafe(FAKE_SAFE)).toBe(false);
  });

  it('SAFE_PROXY_RUNTIME_CODE is the 171-byte SafeProxy 1.4.1 runtime', () => {
    expect((SAFE_PROXY_RUNTIME_CODE.length - 2) / 2).toBe(0xab);
    expect(SAFE_PROXY_RUNTIME_CODE.startsWith('0x608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e')).toBe(true);
    expect(SAFE_PROXY_RUNTIME_CODE.endsWith('64736f6c63430007060033')).toBe(true);
  });
});

describe('createLookupChain (view calls + chunked getLogs over a viem-like client)', () => {
  const req = (target: Address, type: number, status: number, att: bigint, cit: bigint, createdAt: bigint) =>
    [addr(9), target, type, status, 'ipfs://x', att, cit, createdAt] as const;

  it('findMintRequest walks requests newest-first and returns the executed attestation of the citizen', async () => {
    const requests: Record<string, ReturnType<typeof req>> = {
      '0': req(CIT, 0, 3, 2n, 1n, 100n), // the one
      '1': req(CIT, 1, 3, 3n, 1n, 200n), // a revocation, ignored
      '2': req(ATT1, 0, 3, 2n, 1n, 300n),
      '3': req(CIT, 0, 2, 0n, 0n, 400n), // rejected, ignored
    };
    const client = {
      getBlockNumber: jest.fn(),
      getBlock: jest.fn(),
      getLogs: jest.fn(),
      getCode: jest.fn(),
      getStorageAt: jest.fn(),
      readContract: jest.fn(async (a: any) => (a.functionName === 'requestCount' ? 4n : requests[String(a.args[0])])),
    };
    const chain = createLookupChain(client, { readGuardians: async () => [] });
    expect(await chain.findMintRequest(CIT)).toEqual({ requestId: 0n, createdAt: 100n, approvals: 3 });
    expect(await chain.findMintRequest(addr(0x77))).toBeNull();
    expect(client.getLogs).not.toHaveBeenCalled();
  });

  it('approvalsOf scans forward from the estimated creation block in capped windows, stopping once all approvals are in', async () => {
    const calls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    const client = {
      getBlockNumber: jest.fn(),
      // latest block 10_000 at t = 50_000 → creation at t = 49_000 is ~200 blocks back
      getBlock: jest.fn(async () => ({ number: 10_000n, timestamp: 50_000n })),
      getLogs: jest.fn(async (a: any) => {
        calls.push({ fromBlock: a.fromBlock, toBlock: a.toBlock });
        const hits = [
          { block: 9_805n, approver: ATT1, signedAsAttester: true },
          { block: 9_830n, approver: CIT, signedAsAttester: false },
        ].filter((h) => h.block >= a.fromBlock && h.block <= a.toBlock);
        return hits.map((h, i) => ({ address: addr(1), blockNumber: h.block, logIndex: i, args: { requestId: 7n, ...h } }));
      }),
      getCode: jest.fn(),
      getStorageAt: jest.fn(),
      readContract: jest.fn(),
    };
    const chain = createLookupChain(client, { readGuardians: async () => [], range: 50n, citizenFromBlock: 0n });
    const out = await chain.approvalsOf({ requestId: 7n, createdAt: 49_000n, approvals: 2 });
    expect(out).toEqual([
      { approver: ATT1, signedAsAttester: true },
      { approver: CIT, signedAsAttester: false },
    ]);
    for (const c of calls) expect(c.toBlock - c.fromBlock).toBeLessThan(50n);
    expect(calls[0].fromBlock).toBe(9_750n); // estimate 9_800 minus one window of margin
    expect(calls).toHaveLength(4); // one batch of 4 windows found both; the rest (up to the tip) skipped
    expect(client.getLogs.mock.calls[0][0].args).toEqual({ requestId: 7n });
  });

  it('ownerLogsFor scans AddedOwner(owner) from any emitter over the whole range, never stopping at the first hit', async () => {
    const OWNER = addr(0x0e);
    const calls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    const client = {
      getBlockNumber: jest.fn(async () => 1_000n),
      getBlock: jest.fn(),
      getLogs: jest.fn(async (a: any) => {
        calls.push({ fromBlock: a.fromBlock, toBlock: a.toBlock });
        return a.fromBlock <= 520n && 520n <= a.toBlock
          ? [{ address: SAFE.toLowerCase(), blockNumber: 520n, logIndex: 0, args: { owner: OWNER } }]
          : [];
      }),
      getCode: jest.fn(),
      getStorageAt: jest.fn(),
      readContract: jest.fn(async (a: any) => (a.functionName === 'getOwners' && a.address === SAFE ? [OWNER] : [])),
    };
    const chain = createLookupChain(client as any, { readGuardians: async () => [], range: 50n, passkeyFromBlock: 0n });
    expect(await chain.ownerLogsFor(OWNER)).toEqual([{ emitter: SAFE, blockNumber: 520n }]);
    const first = client.getLogs.mock.calls[0][0];
    expect(first.address).toBeUndefined();
    expect(first.args).toEqual({ owner: OWNER });
    expect(first.event.name).toBe('AddedOwner');
    expect(calls[0]).toEqual({ fromBlock: 951n, toBlock: 1_000n });
    // backward windows from the tip down to the epoch block: all 21 windows of [0, 1000]
    expect(calls).toHaveLength(21);
    expect(calls[calls.length - 1]).toEqual({ fromBlock: 0n, toBlock: 0n });
    expect(await chain.readOwners(SAFE)).toEqual([OWNER]);
  });
});
