/**
 * Test-only viem-like client for recovery-lookup's `createLookupChain`: a tiny chain with app
 * passkey Safes, other contracts, owners and AddedOwner logs.
 */
import { getAddress, pad, type Address, type Hex } from 'viem';
import {
  SAFE_4337_MODULE,
  SAFE_FALLBACK_HANDLER_SLOT,
  SAFE_L2_SINGLETON,
  SAFE_PROXY_RUNTIME_CODE,
  SOCIAL_RECOVERY_MODULE,
} from '../constants';

const addr = (n: number) => getAddress(`0x${n.toString(16).padStart(40, '0')}`);

/** The shape of a viem read revert: ContractFunctionExecutionError caused by ContractFunctionRevertedError. */
export function reverted(): Error {
  return Object.assign(new Error('The contract function "getOwners" reverted.'), {
    name: 'ContractFunctionExecutionError',
    cause: Object.assign(new Error('execution reverted'), { name: 'ContractFunctionRevertedError' }),
  });
}

/**
 * A transient -32603 as viem 2.x reports it from a contract read: getContractError wraps an
 * InternalRpcError that carries a message as ContractFunctionRevertedError
 * (utils/errors/getContractError.ts), inside ContractFunctionExecutionError.
 */
export function internalRpcError(fn = 'getModulesPaginated'): Error {
  const rpc = Object.assign(new Error('An internal error was received.'), { name: 'InternalRpcError', code: -32603 });
  return Object.assign(new Error(`The contract function "${fn}" reverted with the following reason:\nInternal error`), {
    name: 'ContractFunctionExecutionError',
    cause: Object.assign(new Error('Internal error'), { name: 'ContractFunctionRevertedError', cause: rpc }),
  });
}

/**
 * A viem-like client over a tiny fake chain: `safes` look like app passkey Safes (proxy runtime,
 * singleton, fallback handler, the two modules); `contracts` have other code; `owners` per address;
 * `logs` = AddedOwner hits (emitter, block).
 */
export function shapeClient(p: {
  tip: bigint;
  safes: Address[];
  contracts?: Address[];
  owners: Record<string, Address[]>;
  logs: Array<{ emitter: Address; block: bigint }>;
  modules?: Address[];
  /** Errors thrown by these reads (any address). */
  failRead?: Partial<Record<'getOwners' | 'getModulesPaginated', Error>>;
}) {
  const word = (a: Address): Hex => pad(a, { size: 32 });
  const isSafe = (a: Address) => p.safes.includes(a);
  return {
    getBlockNumber: jest.fn(async () => p.tip),
    getBlock: jest.fn(),
    getLogs: jest.fn(async (a: any) =>
      p.logs
        .filter((l) => l.block >= a.fromBlock && l.block <= a.toBlock)
        .map((l, i) => ({ address: l.emitter, blockNumber: l.block, logIndex: i, args: { owner: a.args.owner } })),
    ),
    getCode: jest.fn(async ({ address }: { address: Address }) =>
      isSafe(address) ? SAFE_PROXY_RUNTIME_CODE : (p.contracts ?? []).includes(address) ? ('0x6080604052' as Hex) : undefined,
    ),
    getStorageAt: jest.fn(async ({ address, slot }: { address: Address; slot: Hex }) => {
      if (!isSafe(address)) return '0x' as Hex;
      if (BigInt(slot) === 0n) return word(SAFE_L2_SINGLETON);
      if (slot === SAFE_FALLBACK_HANDLER_SLOT) return word(SAFE_4337_MODULE);
      return '0x' as Hex;
    }),
    readContract: jest.fn(async (a: any) => {
      const fail = p.failRead?.[a.functionName as 'getOwners' | 'getModulesPaginated'];
      if (fail) throw fail;
      if (a.functionName === 'getOwners') {
        if (!p.owners[a.address]) throw reverted();
        return p.owners[a.address];
      }
      if (a.functionName === 'getModulesPaginated') {
        return [p.modules ?? [SOCIAL_RECOVERY_MODULE, SAFE_4337_MODULE], addr(1)];
      }
      throw new Error(`unexpected ${a.functionName}`);
    }),
  };
}
