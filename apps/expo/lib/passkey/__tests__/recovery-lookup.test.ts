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
      findMintRequest: jest.fn(async () => (approvals ? { requestId: 7n, blockNumber: 1000n } : null)),
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
    expect(chain.approvalsOf).toHaveBeenCalledWith(7n, 1000n);
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

describe('createLookupChain (chunked getLogs over a viem-like client)', () => {
  it('findMintRequest scans backward in capped windows and stops at the newest mint', async () => {
    const calls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    const client = {
      getBlockNumber: jest.fn(async () => 250n),
      getLogs: jest.fn(async (a: any) => {
        calls.push({ fromBlock: a.fromBlock, toBlock: a.toBlock });
        if (a.fromBlock <= 120n && a.toBlock >= 120n) {
          return [{ address: addr(1), blockNumber: 120n, logIndex: 0, args: { citizen: CIT, tokenId: 3n, requestId: 42n } }];
        }
        return [];
      }),
      getCode: jest.fn(),
      readContract: jest.fn(),
    };
    const chain = createLookupChain(client, { readGuardians: async () => [], range: 50n, citizenFromBlock: 0n });
    expect(await chain.findMintRequest(CIT)).toEqual({ requestId: 42n, blockNumber: 120n });
    for (const c of calls) expect(c.toBlock - c.fromBlock).toBeLessThan(50n);
    expect(calls[0].toBlock).toBe(250n);
  });

  it('approvalsOf walks back from the mint until the request creation appears', async () => {
    const client = {
      getBlockNumber: jest.fn(async () => 500n),
      getLogs: jest.fn(async (a: any) => {
        const approved = a.event.name === 'RequestApproved';
        if (approved && a.fromBlock <= 90n && a.toBlock >= 90n) {
          return [{ address: addr(1), blockNumber: 90n, logIndex: 1, args: { requestId: 7n, approver: ATT1, signedAsAttester: true } }];
        }
        if (!approved && a.fromBlock <= 60n && a.toBlock >= 60n) {
          return [{ address: addr(1), blockNumber: 60n, logIndex: 0, args: { requestId: 7n } }];
        }
        return [];
      }),
      getCode: jest.fn(),
      readContract: jest.fn(),
    };
    const chain = createLookupChain(client, { readGuardians: async () => [], range: 20n, citizenFromBlock: 0n });
    expect(await chain.approvalsOf(7n, 100n)).toEqual([{ approver: ATT1, signedAsAttester: true }]);
    const lowest = Math.min(...client.getLogs.mock.calls.map((c: any[]) => Number(c[0].fromBlock)));
    expect(lowest).toBeGreaterThan(0); // stopped after the creation window, never reached block 0
  });
});
