/**
 * On-chain lookups behind "Konto wiederherstellen" and the guardian suggestion.
 *
 * Link old → new is on-chain only (spec "Target model"): the passkey Safe is an ADMIN of the
 * legacy thirdweb account. thirdweb's AccountPermissions emits `AdminUpdated(address indexed
 * signer, bool isAdmin)` from the legacy account on every admin change, so
 *   legacy → its passkey Safe(s) = current contract admins from those events, re-checked with
 *   `isAdmin(signer)` (the log can be stale), and
 *   Safe → its legacy account(s) = emitters of AdminUpdated(signer = Safe), re-checked the same way.
 * A recoverable wallet additionally needs >= 1 guardian (readGuardians). After the v3 moveTo the
 * profile may point at the Safe itself (it holds the NFT): that address is checked directly too.
 *
 * Default guardians = the attesters who approved the request that minted this citizen: the
 * executed CitizenNFTv2 attestation request whose target is the citizen (found with view calls,
 * `requestCount` + `getRequest`, since a 1.6M-block log scan is too slow at 10k blocks per
 * getLogs), then its `RequestApproved(requestId, approver, signedAsAttester)` logs with
 * signedAsAttester = true, scanned forward from the request's `createdAt`. Migration-minted
 * citizens have no request (MigrationMinted) → no suggestion. Each approver (a legacy account) is replaced by its
 * passkey Safe when it has exactly one; otherwise the legacy account itself is the guardian (its
 * Safe confirms via legacy.execute, see planGuardianConfirm).
 *
 * Every chain access goes through `LookupChain`; `createLookupChain` wires a viem client.
 */
import { getAddress, isAddressEqual, parseAbiItem, type Address, type Hex } from 'viem';
import {
  CITIZEN_NFT_V2,
  SAFE_4337_MODULE,
  SAFE_FALLBACK_HANDLER_SLOT,
  SAFE_L2_SINGLETON,
  SAFE_PROXY_RUNTIME_CODE,
  SOCIAL_RECOVERY_MODULE,
} from './constants';
import { legacyAccountReadAbi } from './legacy-handover';
import {
  CITIZEN_NFT_V2_FROM_BLOCK,
  GNOSIS_SLOT_SECONDS,
  LOG_BLOCK_RANGE,
  PASSKEY_EPOCH_BLOCK,
  blockWindows,
  scanLogs,
  type BlockWindow,
} from './log-scan';

export type AdminLog = { emitter: Address; signer: Address; isAdmin: boolean; blockNumber: bigint; logIndex: number };

export type LookupChain = {
  /** AdminUpdated events emitted BY `account` (its admin history). */
  adminLogsOf: (account: Address) => Promise<AdminLog[]>;
  /** AdminUpdated events naming `signer`, from any account. */
  adminLogsFor: (signer: Address) => Promise<AdminLog[]>;
  isAdmin: (account: Address, signer: Address) => Promise<boolean>;
  readGuardians: (safe: Address) => Promise<Address[]>;
  hasCode: (a: Address) => Promise<boolean>;
  /**
   * Safe `AddedOwner(owner)` events naming `owner`, from any emitter: scanned backward from the
   * tip to PASSKEY_EPOCH_BLOCK, stopping after the first window batch for which `stop(logsSoFar)`
   * holds (default: any hit).
   */
  ownerLogsFor: (
    owner: Address,
    stop?: (logsSoFar: OwnerLog[]) => boolean | Promise<boolean>,
  ) => Promise<OwnerLog[]>;
  /** Safe.getOwners() right now. */
  readOwners: (safe: Address) => Promise<Address[]>;
  /**
   * `a` has the shape of an app passkey Safe: canonical SafeProxy 1.4.1 runtime, singleton =
   * SafeL2 1.4.1, fallback handler = Safe4337Module, modules exactly {Safe4337Module,
   * SocialRecoveryModule}. A transport error throws.
   */
  isPasskeySafe: (a: Address) => Promise<boolean>;
};

export type OwnerLog = { emitter: Address; blockNumber: bigint };

export type MintRequest = {
  requestId: bigint;
  /** Unix seconds of the request's creation (approvals come after it). */
  createdAt: bigint;
  /** attesterSignatures + citizenSignatures recorded on the request. */
  approvals: number;
};

export type SuggestChain = {
  /** The executed attestation request whose target is `citizen` (null: migration mint / none). */
  findMintRequest: (citizen: Address) => Promise<MintRequest | null>;
  /** RequestApproved logs of that request. */
  approvalsOf: (req: MintRequest) => Promise<Array<{ approver: Address; signedAsAttester: boolean }>>;
};

const ordered = (a: AdminLog, b: AdminLog) =>
  a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1;

/** Final admin state per (emitter, signer) → the signers whose last event says isAdmin = true. */
export function currentAdminsFromLogs(logs: readonly AdminLog[], key: 'signer' | 'emitter' = 'signer'): Address[] {
  const last = new Map<string, AdminLog>();
  for (const l of [...logs].sort(ordered)) last.set(`${l.emitter.toLowerCase()}|${l.signer.toLowerCase()}`, l);
  const out: Address[] = [];
  for (const l of last.values()) {
    if (!l.isAdmin) continue;
    const a = getAddress(l[key]);
    if (!out.some((x) => isAddressEqual(x, a))) out.push(a);
  }
  return out;
}

async function safely<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

/** Contract admins of `legacy` right now (passkey Safes; the thirdweb EOA has no code). */
export async function findLinkedSafes(legacy: Address, chain: LookupChain): Promise<Address[]> {
  const candidates = currentAdminsFromLogs(await chain.adminLogsOf(legacy), 'signer');
  const checks = await Promise.all(
    candidates.map(async (c) => {
      const [code, admin] = await Promise.all([safely(chain.hasCode(c), false), safely(chain.isAdmin(legacy, c), false)]);
      return code && admin ? c : null;
    }),
  );
  return checks.filter((c): c is Address => !!c);
}

/** Legacy accounts `safe` administers right now. */
export async function findLinkedLegacies(safe: Address, chain: LookupChain): Promise<Address[]> {
  const emitters = currentAdminsFromLogs(
    (await chain.adminLogsFor(safe)).filter((l) => isAddressEqual(l.signer, safe)),
    'emitter',
  );
  const checks = await Promise.all(emitters.map(async (e) => ((await safely(chain.isAdmin(e, safe), false)) ? e : null)));
  return checks.filter((c): c is Address => !!c);
}

/** viem error names that mean "this contract answered, and it is not a Safe" (revert / no data). */
const NOT_A_SAFE_ERRORS = new Set(['ContractFunctionRevertedError', 'ContractFunctionZeroDataError']);

/** True when `e` (or an error in its cause chain) is a contract revert / empty return, not a transport failure. */
export function isContractRevert(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 10; cur = (cur as { cause?: unknown }).cause, depth++) {
    if (NOT_A_SAFE_ERRORS.has((cur as { name?: string }).name ?? '')) return true;
  }
  return false;
}

/** A revert means "not a Safe" → `fallback`; any other error (transport, timeout) is rethrown. */
async function unlessReverted<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (isContractRevert(e)) return fallback;
    throw e;
  }
}

/**
 * The app passkey Safes whose owners are exactly `[owner]` right now, newest AddedOwner log
 * first, de-duplicated. A recovery to a new passkey keeps the Safe's address but installs the
 * per-key signer as its only owner, so this finds a recovered Safe from its new key.
 *
 * AddedOwner is matched by topic only, so anyone can emit one naming a public signer address.
 * Every emitter is therefore shape-checked (`isPasskeySafe`) and owner-checked, and the backward
 * scan stops only once a log yields a Safe that passes, so a newer junk log cannot hide the real
 * one. A stale log (owner changed again) or a reverting emitter is dropped; a transport error
 * throws (the caller must not fall back to another Safe on a flaky RPC).
 */
export async function findSafesByOwner(
  owner: Address,
  chain: Pick<LookupChain, 'ownerLogsFor' | 'readOwners' | 'isPasskeySafe'>,
): Promise<Address[]> {
  const verdicts = new Map<string, Promise<boolean>>();
  const passes = (emitter: Address): Promise<boolean> => {
    const key = emitter.toLowerCase();
    let v = verdicts.get(key);
    if (!v) {
      v = (async () => {
        if (!(await unlessReverted(chain.isPasskeySafe(emitter), false))) return false;
        const owners = await unlessReverted(chain.readOwners(emitter), [] as Address[]);
        return owners.length === 1 && isAddressEqual(owners[0], owner);
      })();
      verdicts.set(key, v);
    }
    return v;
  };
  const logs = await chain.ownerLogsFor(owner, async (found) =>
    (await Promise.all(found.map((l) => passes(getAddress(l.emitter))))).some(Boolean),
  );
  const sorted = [...logs].sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1));
  const emitters: Address[] = [];
  for (const l of sorted) {
    const e = getAddress(l.emitter);
    if (!emitters.some((x) => isAddressEqual(x, e))) emitters.push(e);
  }
  const checks = await Promise.all(emitters.map(async (e) => ((await passes(e)) ? e : null)));
  return checks.filter((c): c is Address => !!c);
}

export type RecoveryCandidate = {
  /** The passkey Safe to recover. */
  wallet: Address;
  /** The legacy account it administers (sponsor hint for a wallet that holds no NFT itself). */
  recoveryLegacy: Address | null;
  guardianCount: number;
};

/**
 * The recoverable passkey Safes behind a profile's wallet: the wallet itself if it has guardians
 * (post-v3 profile = Safe), plus every linked Safe of it (legacy profile) with >= 1 guardian.
 */
export async function findRecoverableAccounts(profileWallet: Address, chain: LookupChain): Promise<RecoveryCandidate[]> {
  const wallet = getAddress(profileWallet);
  const out: RecoveryCandidate[] = [];
  const direct = await safely(chain.readGuardians(wallet), [] as Address[]);
  if (direct.length > 0) out.push({ wallet, recoveryLegacy: null, guardianCount: direct.length });
  const safes = await safely(findLinkedSafes(wallet, chain), [] as Address[]);
  for (const s of safes) {
    if (out.some((c) => isAddressEqual(c.wallet, s))) continue;
    const g = await safely(chain.readGuardians(s), [] as Address[]);
    if (g.length > 0) out.push({ wallet: s, recoveryLegacy: wallet, guardianCount: g.length });
  }
  return out;
}

/** The address to add as guardian for an approver: its single passkey Safe, else the account itself. */
export async function resolveGuardianAddress(account: Address, chain: LookupChain): Promise<Address> {
  const safes = await safely(findLinkedSafes(account, chain), [] as Address[]);
  return safes.length === 1 ? safes[0] : getAddress(account);
}

export type SuggestedGuardian = { approver: Address; guardian: Address };

/**
 * The attesters who approved `citizen`'s attestation, as guardian addresses. Excludes the
 * citizen itself and `wallet` (its own Safe). [] when there is no request (migration mint).
 */
export async function suggestDefaultGuardians(
  p: { citizen: Address; wallet: Address },
  chain: SuggestChain & LookupChain,
): Promise<SuggestedGuardian[]> {
  const mint = await chain.findMintRequest(p.citizen);
  if (!mint) return [];
  const approvals = await chain.approvalsOf(mint);
  const approvers: Address[] = [];
  for (const a of approvals) {
    if (!a.signedAsAttester) continue;
    const addr = getAddress(a.approver);
    if (isAddressEqual(addr, p.citizen) || isAddressEqual(addr, p.wallet)) continue;
    if (!approvers.some((x) => isAddressEqual(x, addr))) approvers.push(addr);
  }
  const out: SuggestedGuardian[] = [];
  for (const approver of approvers) {
    const guardian = await resolveGuardianAddress(approver, chain);
    if (isAddressEqual(guardian, p.wallet)) continue;
    out.push({ approver, guardian });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Real chain wiring (a viem public client; chunked getLogs)
// ---------------------------------------------------------------------------

export const adminUpdatedEvent = parseAbiItem('event AdminUpdated(address indexed signer, bool isAdmin)');
export const citizenMintedEvent = parseAbiItem(
  'event CitizenNFTMinted(address indexed citizen, uint256 indexed tokenId, uint256 indexed requestId)',
);
export const requestApprovedEvent = parseAbiItem(
  'event RequestApproved(uint256 indexed requestId, address indexed approver, bool signedAsAttester)',
);
export const safeAddedOwnerEvent = parseAbiItem('event AddedOwner(address indexed owner)');
const safeOwnersAbi = [
  { type: 'function', name: 'getOwners', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address[]' }] },
  {
    type: 'function',
    name: 'getModulesPaginated',
    stateMutability: 'view',
    inputs: [
      { name: 'start', type: 'address' },
      { name: 'pageSize', type: 'uint256' },
    ],
    outputs: [
      { name: 'array', type: 'address[]' },
      { name: 'next', type: 'address' },
    ],
  },
] as const;
/** Safe ModuleManager / OwnerManager linked-list sentinel. */
const SAFE_SENTINEL: Address = '0x0000000000000000000000000000000000000001';
const sameAddressWord = (word: Hex | undefined, a: Address) => !!word && word !== '0x' && BigInt(word) === BigInt(a);
const citizenRequestAbi = [
  { type: 'function', name: 'requestCount', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'getRequest',
    stateMutability: 'view',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [
      { name: 'requester', type: 'address' },
      { name: 'target', type: 'address' },
      { name: 'requestType', type: 'uint8' },
      { name: 'status', type: 'uint8' },
      { name: 'evidenceURI', type: 'string' },
      { name: 'attesterSignatures', type: 'uint256' },
      { name: 'citizenSignatures', type: 'uint256' },
      { name: 'createdAt', type: 'uint256' },
    ],
  },
] as const;

type RawLog = { address: Address; blockNumber: bigint | null; logIndex: number | null; args: Record<string, unknown> };

export type LookupClient = {
  getBlockNumber: () => Promise<bigint>;
  getBlock: () => Promise<{ number: bigint; timestamp: bigint }>;
  getLogs: (args: any) => Promise<RawLog[]>;
  getCode: (args: { address: Address }) => Promise<Hex | undefined>;
  getStorageAt: (args: { address: Address; slot: Hex }) => Promise<Hex | undefined>;
  readContract: (args: any) => Promise<any>;
};

const toAdminLog = (l: RawLog): AdminLog => ({
  emitter: getAddress(l.address),
  signer: getAddress(l.args.signer as Address),
  isAdmin: Boolean(l.args.isAdmin),
  blockNumber: l.blockNumber ?? 0n,
  logIndex: l.logIndex ?? 0,
});

export function createLookupChain(
  client: LookupClient,
  opts: {
    readGuardians: (safe: Address) => Promise<Address[]>;
    citizenNft?: Address;
    range?: bigint;
    passkeyFromBlock?: bigint;
    citizenFromBlock?: bigint;
  },
): LookupChain & SuggestChain {
  const range = opts.range ?? LOG_BLOCK_RANGE;
  const citizenNft = opts.citizenNft ?? CITIZEN_NFT_V2;
  const passkeyFrom = opts.passkeyFromBlock ?? PASSKEY_EPOCH_BLOCK;
  const citizenFrom = opts.citizenFromBlock ?? CITIZEN_NFT_V2_FROM_BLOCK;
  const windowsTo = async (from: bigint, backward = false) =>
    blockWindows(from, await client.getBlockNumber(), range, backward);

  return {
    async adminLogsOf(account) {
      const logs = await scanLogs(await windowsTo(passkeyFrom), (w: BlockWindow) =>
        client.getLogs({ address: account, event: adminUpdatedEvent, ...w }),
      );
      return logs.map(toAdminLog);
    },
    async adminLogsFor(signer) {
      const logs = await scanLogs(await windowsTo(passkeyFrom), (w: BlockWindow) =>
        client.getLogs({ event: adminUpdatedEvent, args: { signer }, ...w }),
      );
      return logs.map(toAdminLog);
    },
    isAdmin: (account, signer) =>
      client.readContract({ address: account, abi: legacyAccountReadAbi, functionName: 'isAdmin', args: [signer] }),
    readGuardians: opts.readGuardians,
    async hasCode(a) {
      const code = await client.getCode({ address: a });
      return !!code && code !== '0x';
    },
    async ownerLogsFor(owner, stop) {
      const toOwnerLog = (l: RawLog): OwnerLog => ({ emitter: getAddress(l.address), blockNumber: l.blockNumber ?? 0n });
      const logs = await scanLogs(
        await windowsTo(passkeyFrom, true),
        (w: BlockWindow) => client.getLogs({ event: safeAddedOwnerEvent, args: { owner }, ...w }),
        { stop: (found) => (stop ? stop(found.map(toOwnerLog)) : found.length > 0) },
      );
      return logs.map(toOwnerLog);
    },
    async readOwners(safe) {
      return [...((await client.readContract({ address: safe, abi: safeOwnersAbi, functionName: 'getOwners' })) as readonly Address[])];
    },
    async isPasskeySafe(a) {
      const code = await client.getCode({ address: a });
      if (!code || code.toLowerCase() !== SAFE_PROXY_RUNTIME_CODE.toLowerCase()) return false;
      const [singleton, fallback] = await Promise.all([
        client.getStorageAt({ address: a, slot: '0x0' }),
        client.getStorageAt({ address: a, slot: SAFE_FALLBACK_HANDLER_SLOT }),
      ]);
      if (!sameAddressWord(singleton, SAFE_L2_SINGLETON) || !sameAddressWord(fallback, SAFE_4337_MODULE)) return false;
      const [modules, next] = (await client.readContract({
        address: a,
        abi: safeOwnersAbi,
        functionName: 'getModulesPaginated',
        args: [SAFE_SENTINEL, 10n],
      })) as readonly [readonly Address[], Address];
      return (
        isAddressEqual(next, SAFE_SENTINEL) &&
        modules.length === 2 &&
        [SAFE_4337_MODULE, SOCIAL_RECOVERY_MODULE].every((m) => modules.some((x) => isAddressEqual(x, m)))
      );
    },
    async findMintRequest(citizen) {
      const count = BigInt(await client.readContract({ address: citizenNft, abi: citizenRequestAbi, functionName: 'requestCount' }));
      for (let hi = count - 1n; hi >= 0n; hi -= 8n) {
        const ids: bigint[] = [];
        for (let i = hi; i > hi - 8n && i >= 0n; i--) ids.push(i);
        const rows = await Promise.all(
          ids.map(async (id) => ({
            id,
            r: (await client.readContract({
              address: citizenNft,
              abi: citizenRequestAbi,
              functionName: 'getRequest',
              args: [id],
            })) as readonly [Address, Address, number, number, string, bigint, bigint, bigint],
          })),
        );
        for (const { id, r } of rows) {
          const [, target, requestType, status, , attesterSignatures, citizenSignatures, createdAt] = r;
          if (Number(requestType) === 0 && Number(status) === 3 && isAddressEqual(target, citizen)) {
            return { requestId: id, createdAt: BigInt(createdAt), approvals: Number(attesterSignatures) + Number(citizenSignatures) };
          }
        }
      }
      return null;
    },
    async approvalsOf(req) {
      // Estimate the creation block from its timestamp (5 s slots; missed slots only make the
      // real block later), keep one window of margin, then scan forward until every recorded
      // approval showed up.
      const latest = await client.getBlock();
      const behind = (latest.timestamp - req.createdAt) / GNOSIS_SLOT_SECONDS;
      const est = latest.number - behind - range;
      const from = est > citizenFrom ? est : citizenFrom;
      const logs = await scanLogs(
        blockWindows(from, latest.number, range),
        (w: BlockWindow) => client.getLogs({ address: citizenNft, event: requestApprovedEvent, args: { requestId: req.requestId }, ...w }),
        { stop: (found) => found.length >= req.approvals },
      );
      return logs.map((l) => ({ approver: getAddress(l.args.approver as Address), signedAsAttester: Boolean(l.args.signedAsAttester) }));
    },
  };
}
