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
import { SAFE7579 } from './session-keys/builders';
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
   * Every Safe `AddedOwner(owner)` event naming `owner`, from any emitter, over the full range
   * PASSKEY_EPOCH_BLOCK → tip (no early stop: a newer log must never hide an older one).
   */
  ownerLogsFor: (owner: Address) => Promise<OwnerLog[]>;
  /** Safe.getOwners() right now. */
  readOwners: (safe: Address) => Promise<Address[]>;
  /**
   * `a` has the shape of an app passkey Safe: canonical SafeProxy 1.4.1 runtime, singleton =
   * SafeL2 1.4.1, fallback handler = Safe4337Module, modules exactly {Safe4337Module,
   * SocialRecoveryModule}. Only a code / storage mismatch returns false; every thrown error
   * (also a viem "revert" on getModulesPaginated, which may be a transient -32603) propagates.
   */
  isPasskeySafe: (a: Address) => Promise<boolean>;
  /**
   * SocialRecoveryModule `GuardianAdded(wallet, guardian)` logs whose guardian is any of
   * `guardians`, from PASSKEY_EPOCH_BLOCK (the recovery words' pool → candidate wallets; the
   * caller re-checks the current guardians, a log can be stale).
   */
  guardianLogsFor: (guardians: readonly Address[]) => Promise<Array<{ wallet: Address; guardian: Address }>>;
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

/** Emitters shape-checked in parallel at most (a flood of fake logs must not rate-limit sign-in). */
const OWNER_CHECK_CONCURRENCY = 4;

/**
 * Every app passkey Safe whose owners are exactly `[owner]` right now, newest AddedOwner log
 * first, de-duplicated. A recovery to a new passkey keeps the Safe's address but installs the
 * per-key signer as its only owner, so this finds a recovered Safe from its new key.
 *
 * AddedOwner is matched by topic only, so anyone can emit one naming a public signer address.
 * The scan therefore covers the full range back to PASSKEY_EPOCH_BLOCK (~120 windows; callers
 * run it only when the signer contract exists) and every emitter is shape-checked
 * (`isPasskeySafe`) and owner-checked; nothing stops at the first hit, so a newer log cannot
 * hide the real Safe. A stale log (owner changed again) is dropped.
 *
 * Errors: only the getCode / getStorageAt stage of `isPasskeySafe` may say "not a Safe" (a
 * mismatch, never a thrown error). Every thrown error propagates, including what viem reports
 * as a revert: viem maps a transient -32603 InternalRpcError to ContractFunctionRevertedError,
 * and a genuine proxy at the SafeL2 singleton cannot revert on getModulesPaginated / getOwners.
 * Swallowing it would drop the real Safe and let sign-in fall back to the throwaway Safe.
 *
 * Known residual: an attacker can build a fully valid passkey-shaped Safe (factory proxy,
 * SafeL2, both modules, 4337 fallback), add the signer and remove itself, so it passes here.
 * Sign-in then prefers the Safe with history (legacy link or users row), and that signal is
 * forgeable too (the attacker's own thirdweb account can make its Safe an admin) → at worst
 * an ambiguity error, never a silent pick between two Safes that both look known.
 */
export async function findSafesByOwner(
  owner: Address,
  chain: Pick<LookupChain, 'ownerLogsFor' | 'readOwners' | 'isPasskeySafe'>,
): Promise<Address[]> {
  const logs = [...(await chain.ownerLogsFor(owner))].sort((a, b) =>
    a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1,
  );
  const emitters: Address[] = [];
  for (const l of logs) {
    const e = getAddress(l.emitter);
    if (!emitters.some((x) => isAddressEqual(x, e))) emitters.push(e);
  }
  const check = async (e: Address): Promise<Address | null> => {
    if (!(await chain.isPasskeySafe(e))) return null;
    const owners = await chain.readOwners(e);
    return owners.length === 1 && isAddressEqual(owners[0], owner) ? e : null;
  };
  const out: Address[] = [];
  for (let i = 0; i < emitters.length; i += OWNER_CHECK_CONCURRENCY) {
    const batch = await Promise.all(emitters.slice(i, i + OWNER_CHECK_CONCURRENCY).map(check));
    for (const c of batch) if (c) out.push(c);
  }
  return out;
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
/** The real SocialRecoveryModule event (fork-proven: 2 args; the threshold has its own ChangedThreshold). */
export const guardianAddedEvent = parseAbiItem('event GuardianAdded(address indexed wallet, address indexed guardian)');
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
    async ownerLogsFor(owner) {
      const logs = await scanLogs(await windowsTo(passkeyFrom, true), (w: BlockWindow) =>
        client.getLogs({ event: safeAddedOwnerEvent, args: { owner }, ...w }),
      );
      return logs.map((l) => ({ emitter: getAddress(l.address), blockNumber: l.blockNumber ?? 0n }));
    },
    async guardianLogsFor(guardians) {
      if (guardians.length === 0) return [];
      const logs = await scanLogs(await windowsTo(passkeyFrom), (w: BlockWindow) =>
        client.getLogs({ address: SOCIAL_RECOVERY_MODULE, event: guardianAddedEvent, args: { guardian: [...guardians] }, ...w }),
      );
      return logs.map((l) => ({ wallet: getAddress(l.args.wallet as Address), guardian: getAddress(l.args.guardian as Address) }));
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
      if (!sameAddressWord(singleton, SAFE_L2_SINGLETON)) return false;
      // Two app layouts: the original Safe4337Module Safe, or one migrated to Safe7579 for device
      // sessions (Safe7579 is then both the fallback handler and the 4337 module; Safe4337Module gone).
      const accountModule = sameAddressWord(fallback, SAFE_4337_MODULE)
        ? SAFE_4337_MODULE
        : sameAddressWord(fallback, SAFE7579)
          ? SAFE7579
          : null;
      if (!accountModule) return false;
      const [modules, next] = (await client.readContract({
        address: a,
        abi: safeOwnersAbi,
        functionName: 'getModulesPaginated',
        args: [SAFE_SENTINEL, 10n],
      })) as readonly [readonly Address[], Address];
      return (
        isAddressEqual(next, SAFE_SENTINEL) &&
        modules.length === 2 &&
        [accountModule, SOCIAL_RECOVERY_MODULE].every((m) => modules.some((x) => isAddressEqual(x, m)))
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
