/**
 * Restoring an account with the recovery words. Pure: chain reads, backup and storage are injected.
 *
 * The words START a guardian recovery; they never give instant control. Their 5 pool addresses
 * (words.ts) are ordinary guardians of the Safe, so the words sign the same EIP-712 approval a
 * guardian would, the app submits it with `multiConfirmRecovery(..., execute = true)` and the
 * SocialRecoveryModule holds the request for the usual 3 days, during which the owner can cancel.
 * A cancel bumps the module's nonce, so every approval signed before it is dead.
 *
 *   findWalletsByWords      pool → the Safes these words can recover right now
 *   signWordApprovals       the words' guardian signatures for one recovery request
 *   restoreKeysWithVaultKey after the recovery: the `_w` copies of the MACI / Nostr / salt keys,
 *                           unwrapped with the words vault key and re-wrapped under the new passkey
 */
import { getAddress, isAddressEqual, type Address, type Hex } from 'viem';
import { SLOT_LABEL } from './derived-keys';
import { recoveryApprovalTypedData, type GuardianApproval } from './guardians';
import { KEY_BACKUP_SLOTS, type KeyBackupBlobs, type KeyBackupSlot, type RemoteBackup } from './key-backup';
import { phraseErrorMessage, validatePhrase, wordsFromSeed, WORDS_POOL_SIZE, type WordsKit } from './words';
import { isWordsOffBlob, wordsSlot, wrapVaultKey, type VaultKeyStorage } from './words-vault';
import { saveWordsPool } from './words-guardians';
import type { KeyValueStorage } from './migration';

export const NO_WORDS_ACCOUNT_MESSAGE = 'Zu diesen Wörtern haben wir kein Konto gefunden. Vielleicht wurden sie ersetzt oder entfernt.';

export type WordsLookupChain = {
  guardianLogsFor: (guardians: readonly Address[]) => Promise<Array<{ wallet: Address; guardian: Address }>>;
  readGuardians: (wallet: Address) => Promise<Address[]>;
  readThreshold: (wallet: Address) => Promise<bigint>;
  /**
   * The app's passkey Safe shape (recovery-lookup `isPasskeySafe`). The pool addresses are
   * public once used, so anyone can add them as guardians of a decoy wallet; only genuine app
   * Safes are offered.
   */
  isPasskeySafe: (wallet: Address) => Promise<boolean>;
};

export type WordsWallet = { wallet: Address; wordGuardians: Address[]; threshold: number };

const inList = (list: readonly Address[], a: Address) => list.some((x) => isAddressEqual(x, a));

/** The pool addresses that are guardians of a wallet, in pool order. */
export function wordGuardiansOf(pool: readonly Address[], guardians: readonly Address[]): Address[] {
  return pool.filter((a) => inList(guardians, a)).map((a) => getAddress(a));
}

/**
 * Wallets where, right now, at least `threshold` of their guardians are pool addresses. The
 * GuardianAdded log only nominates candidates: words that were removed or replaced since leave
 * their old log behind, so every candidate is re-checked against its current guardians.
 * Read errors propagate (a lost connection must not read as "no account").
 */
export async function findWalletsByWords(pool: readonly Address[], chain: WordsLookupChain): Promise<WordsWallet[]> {
  const logs = await chain.guardianLogsFor(pool);
  const wallets: Address[] = [];
  for (const l of logs) {
    const w = getAddress(l.wallet);
    if (inList(pool, l.guardian) && !inList(wallets, w)) wallets.push(w);
  }
  const checked = await Promise.all(
    wallets.map(async (wallet): Promise<WordsWallet | null> => {
      const [guardians, threshold] = await Promise.all([chain.readGuardians(wallet), chain.readThreshold(wallet)]);
      const wordGuardians = wordGuardiansOf(pool, guardians);
      if (threshold <= 0n || BigInt(wordGuardians.length) < threshold) return null;
      if (!(await chain.isPasskeySafe(wallet))) return null;
      return { wallet, wordGuardians, threshold: Number(threshold) };
    }),
  );
  return checked.filter((c): c is WordsWallet => !!c);
}

export type WordApprovalRequest = {
  wallet: Address;
  newOwner: Address;
  /** SocialRecoveryModule nonce of the wallet, read right before signing. */
  nonce: bigint;
  /** The wallet's guardians right now. */
  guardians: readonly Address[];
  threshold: number;
};

/**
 * Signs with an already derived words kit (the seed runs once per restore). The first `threshold`
 * pool indexes whose address is a guardian sign, in pool-index order; the calldata encoder sorts
 * them by signer.
 */
export async function signWordApprovalsWithKit(kit: WordsKit, p: WordApprovalRequest): Promise<GuardianApproval[]> {
  if (p.threshold <= 0) throw new Error('the wallet has no recovery threshold');
  const typedData = recoveryApprovalTypedData(p.wallet, [p.newOwner], 1, p.nonce);
  const out: GuardianApproval[] = [];
  for (let i = 0; i < WORDS_POOL_SIZE && out.length < p.threshold; i++) {
    const account = kit.account(i);
    if (!inList(p.guardians, account.address)) continue;
    out.push({ signer: getAddress(account.address), signature: await account.signTypedData(typedData) });
  }
  if (out.length < p.threshold) throw new Error('not enough word guardians for the threshold');
  return out;
}

/** The words' approvals for `newOwner` (validates the phrase first; throws a German message on a typo). */
export async function signWordApprovals(p: WordApprovalRequest & { phrase: string }): Promise<GuardianApproval[]> {
  const check = validatePhrase(p.phrase);
  if (!check.ok) throw new Error(phraseErrorMessage(check));
  return signWordApprovalsWithKit(wordsFromSeed(check.phrase), p);
}

type Wrap = (key: Hex, label: string, secret: Uint8Array) => Promise<string>;
type Unwrap = (key: Hex, label: string, blob: string) => Promise<Uint8Array>;

export type WordsKeyRestore = {
  restored: KeyBackupSlot[];
  missing: KeyBackupSlot[];
  /** The restored keys and a new `wvk` are stored under the new passkey (false: only on this phone). */
  rewrapped: boolean;
  /** The backup write failed for a reason that may pass (offline): worth offering again. */
  retryable: boolean;
};

/**
 * After a words recovery: reads the backup as the recovered identity, unwraps each `_w` copy with
 * the words vault key, saves it on this phone, then re-wraps it under the NEW passkey's PRF and
 * writes the primary slots plus a new `wvk` (vault key + pool) in ONE `replace: true` write. The
 * read's own assertion yields the PRF, so this costs the read and the write, nothing more.
 *
 * A missing copy, a tombstoned slot (`WORDS_OFF_BLOB`) or a blob that does not unwrap is "no copy"
 * (reported in `missing`), never an error. A `wvk` is written even when nothing came back: without
 * it this passkey could not read the vault key, and new keys would get no words copy.
 * Only a failed READ throws (German): the caller offers a retry.
 */
export async function restoreKeysWithVaultKey(d: {
  vaultKey: Hex;
  remote: RemoteBackup;
  getPrf: () => Promise<Hex | null>;
  wrap: Wrap;
  unwrap: Unwrap;
  saveLocal: (slot: KeyBackupSlot, secret: Uint8Array) => Promise<void>;
  /** The 5 public pool addresses, carried in the new `wvk`. */
  pool?: readonly Address[];
}): Promise<WordsKeyRestore> {
  const read = await d.remote.read();
  if (read.status === 'disabled') return { restored: [], missing: [...KEY_BACKUP_SLOTS], rewrapped: false, retryable: false };
  const blobs: KeyBackupBlobs = read.status === 'found' ? read.blobs : {};

  const secrets: { slot: KeyBackupSlot; secret: Uint8Array }[] = [];
  const missing: KeyBackupSlot[] = [];
  for (const slot of KEY_BACKUP_SLOTS) {
    const blob = blobs[wordsSlot(slot)];
    if (!blob || isWordsOffBlob(blob)) {
      missing.push(slot);
      continue;
    }
    try {
      const secret = await d.unwrap(d.vaultKey, SLOT_LABEL[slot], blob);
      await d.saveLocal(slot, secret);
      secrets.push({ slot, secret });
    } catch {
      missing.push(slot);
    }
  }
  const restored = secrets.map((s) => s.slot);

  let rewrapped = false;
  let retryable = false;
  try {
    const prf = read.prf ?? (await d.getPrf());
    if (prf) {
      const out: KeyBackupBlobs = {};
      for (const { slot, secret } of secrets) out[slot] = await d.wrap(prf, SLOT_LABEL[slot], secret);
      out.wvk = await wrapVaultKey(prf, d.vaultKey, d.wrap, d.pool && d.pool.length === WORDS_POOL_SIZE ? d.pool : undefined);
      rewrapped = (await d.remote.write(out, true)) === 'stored';
    }
  } catch {
    // The keys are on this phone already; offer the backup again later.
    retryable = true;
  }
  return { restored, missing, rewrapped, retryable };
}

/** German note after the key restore (null: everything came back and is backed up). */
export function wordsKeyRestoreMessage(r: WordsKeyRestore): string | null {
  if (r.missing.length === KEY_BACKUP_SLOTS.length) {
    return 'Unter deinen Wörtern war keine Sicherung deiner Schlüssel gespeichert. Dein Konto ist trotzdem wieder da.';
  }
  if (r.missing.length > 0) {
    return 'Nicht alle Schlüssel waren unter deinen Wörtern gesichert. Dein Konto ist trotzdem wieder da.';
  }
  if (!r.rewrapped) {
    return 'Deine Schlüssel sind auf diesem Handy. Die neue Sicherung hat noch nicht geklappt, wir versuchen es später erneut.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pending key restore: survives the recovery state until the keys are back
// ---------------------------------------------------------------------------

/** Public data only (the passkey's public key and addresses); the vault key has its own slot. */
export type PendingWordsRestore = {
  wallet: Address;
  credentialId: string;
  x: Hex;
  y: Hex;
  signer: Address;
  wordsPool: Address[];
};

/** SecureStore keys allow [A-Za-z0-9._-] only. */
export const pendingWordsRestoreKey = (wallet: Address) => `passkey_pending_words_restore_v1.${wallet.toLowerCase()}`;
/** The words vault key of ONE recovered wallet (device only), so another account's vault key is never touched. */
export const pendingRestoreVaultKeySlot = (wallet: Address) => `pending_restore_vault_key.${wallet.toLowerCase()}`;

export const WORDS_VAULT_KEY_MISSING = 'WordsVaultKeyMissingError';
export const WORDS_RESTORE_NO_VAULT_KEY_MESSAGE =
  'Der Schlüssel zu deinen Wörtern ist auf diesem Handy nicht mehr da. Dein Konto ist trotzdem wieder da.';

const isVaultKeyHex = (v: unknown): v is Hex => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);

export async function savePendingVaultKey(vault: VaultKeyStorage, wallet: Address, key: Hex): Promise<void> {
  if (!isVaultKeyHex(key)) throw new Error('a words vault key is 32 bytes');
  await vault.setItem(pendingRestoreVaultKeySlot(wallet), key.toLowerCase());
}

export async function loadPendingVaultKey(vault: VaultKeyStorage, wallet: Address): Promise<Hex | null> {
  const v = await vault.getItem(pendingRestoreVaultKeySlot(wallet));
  return isVaultKeyHex(v) ? (v.toLowerCase() as Hex) : null;
}

export async function loadPendingWordsRestore(storage: KeyValueStorage, wallet: Address): Promise<PendingWordsRestore | null> {
  try {
    const raw = await storage.getItem(pendingWordsRestoreKey(wallet));
    const p = raw ? (JSON.parse(raw) as PendingWordsRestore) : null;
    if (!p?.credentialId || !p.x || !p.y || !p.signer || !Array.isArray(p.wordsPool) || !isAddressEqual(p.wallet, wallet)) return null;
    return p;
  } catch {
    return null;
  }
}

export async function clearPendingWordsRestore(storage: KeyValueStorage & { removeItem?: (k: string) => Promise<void> }, vault: VaultKeyStorage, wallet: Address): Promise<void> {
  if (storage.removeItem) await storage.removeItem(pendingWordsRestoreKey(wallet));
  else await storage.setItem(pendingWordsRestoreKey(wallet), '');
  await vault.deleteItem(pendingRestoreVaultKeySlot(wallet));
}

/**
 * A words recovery reached `done`: saves the words pool (public addresses, so this phone knows
 * which guardians are the words, whatever happens to the key restore) and the pending-restore
 * marker, which outlives the recovery state until the keys are back.
 */
export async function markWordsRecoveryDone(
  s: { wallet: Address; credentialId?: string; x?: Hex; y?: Hex; signer?: Address; wordsPool?: Address[] },
  storage: KeyValueStorage,
  now: () => number = Date.now,
): Promise<void> {
  if (!s.credentialId || !s.x || !s.y || !s.signer || !s.wordsPool) return;
  await saveWordsPool(storage, { addresses: s.wordsPool, confirmedAt: now() }).catch(() => undefined);
  const p: PendingWordsRestore = {
    wallet: getAddress(s.wallet),
    credentialId: s.credentialId,
    x: s.x,
    y: s.y,
    signer: getAddress(s.signer),
    wordsPool: s.wordsPool.map((a) => getAddress(a)),
  };
  await storage.setItem(pendingWordsRestoreKey(p.wallet), JSON.stringify(p));
}

/**
 * Runs the pending key restore of `wallet` with its per-wallet vault key. Clears the marker and
 * the vault key slot once nothing is left to retry (done, or no backup / no PRF that a retry
 * could change). No vault key → clears too and throws WORDS_VAULT_KEY_MISSING (a retry cannot help).
 * A failed read throws and keeps everything for the next try.
 */
export async function runPendingWordsRestore(
  wallet: Address,
  d: {
    storage: KeyValueStorage & { removeItem?: (k: string) => Promise<void> };
    vault: VaultKeyStorage;
    restore: (p: PendingWordsRestore, vaultKey: Hex) => Promise<WordsKeyRestore>;
  },
): Promise<WordsKeyRestore> {
  const p = await loadPendingWordsRestore(d.storage, wallet);
  if (!p) throw new Error('no pending words restore');
  const vaultKey = await loadPendingVaultKey(d.vault, wallet);
  if (!vaultKey) {
    await clearPendingWordsRestore(d.storage, d.vault, wallet).catch(() => undefined);
    throw Object.assign(new Error(WORDS_RESTORE_NO_VAULT_KEY_MESSAGE), { name: WORDS_VAULT_KEY_MISSING });
  }
  const r = await d.restore(p, vaultKey);
  if (!r.retryable) await clearPendingWordsRestore(d.storage, d.vault, wallet).catch(() => undefined);
  return r;
}
