import { getAddress, type Address } from 'viem';
import { blockWindows, scanLogs } from '../log-scan';
import {
  createLookupChain,
  currentAdminsFromLogs,
  findLinkedLegacies,
  findLinkedSafes,
  findRecoverableAccounts,
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
});
