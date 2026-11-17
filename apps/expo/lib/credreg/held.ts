/**
 * Credential register — what a person holds, plus a small on-device cache.
 *
 * The server's `mine` list is the source of truth for everything a person accepted (public and
 * private); the chain only decides which of those are public. The cache is a convenience for
 * offline starts: after a reinstall nothing is lost, `mine` brings the list back after sign-in.
 * Never logs: entries are bound to an account address.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RESERVED_TYPE_IDS, type CredentialRegistryReader } from '@netizen-labs/credential-registry';
import { useCallback, useEffect, useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import type { Address, Hex } from 'viem';
import { getApiBaseUrl, type ApiResult, type SigningAccount } from '@/lib/signed-request';
import { fetchMine } from './api';
import { registryReader } from './chain';
import { credentialsConfigured, useCredentialsGate } from './gate';
import type { CredentialKind, InvitationView } from './types';

export type HeldCredential = {
  typeId: Hex;
  kind: CredentialKind;
  title: string;
  orgName: string | null;
  imageUrl: string | null;
  recognised: boolean;
  visibility: 'public' | 'private';
  validUntil: number | null; // unix seconds
  invitationId: string | null;
  claim: InvitationView['claim'] | null;
  /** From the type: what the credential unlocks. Absent = unknown. */
  benefits?: string[];
  /** The org lets members show this type publicly. Absent = unknown (treated as allowed). */
  publicAllowed?: boolean;
};

type Reader = Pick<CredentialRegistryReader, 'holdsMany'>;

export type HeldDeps = {
  fetchMine: (a: SigningAccount) => Promise<ApiResult<InvitationView[]>>;
  reader: () => Reader;
  configured: () => boolean;
};

const defaultDeps: HeldDeps = { fetchMine, reader: registryReader, configured: credentialsConfigured };

export const heldCacheKey = (address: string) => `credreg:held:v1:${address.toLowerCase()}`;

const RESERVED = new Set(Object.values(RESERVED_TYPE_IDS).map((id) => id.toLowerCase()));

function isoToSec(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

const KINDS = new Set(['role', 'membership', 'badge']);
const strOrNull = (v: unknown) => v === null || typeof v === 'string';

/** Only well-formed entries come back; anything else in storage is ignored. */
function cacheEntry(v: unknown): HeldCredential | null {
  if (!v || typeof v !== 'object') return null;
  const e = v as Record<string, unknown>;
  if (typeof e.typeId !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(e.typeId)) return null;
  if (!KINDS.has(e.kind as string) || typeof e.title !== 'string') return null;
  if (!strOrNull(e.orgName) || !strOrNull(e.imageUrl) || !strOrNull(e.invitationId)) return null;
  if (e.visibility !== 'public' && e.visibility !== 'private') return null;
  if (!(e.validUntil === null || (typeof e.validUntil === 'number' && Number.isFinite(e.validUntil)))) return null;
  return {
    typeId: e.typeId as Hex,
    kind: e.kind as CredentialKind,
    title: e.title,
    orgName: e.orgName as string | null,
    imageUrl: e.imageUrl as string | null,
    recognised: e.recognised === true,
    visibility: e.visibility,
    validUntil: e.validUntil as number | null,
    invitationId: e.invitationId as string | null,
    ...(Array.isArray(e.benefits) ? { benefits: e.benefits.filter((b): b is string => typeof b === 'string') } : {}),
    ...(typeof e.publicAllowed === 'boolean' ? { publicAllowed: e.publicAllowed } : {}),
    claim: null, // never stored: proofs and claim signatures come only from the server
  };
}

async function readCache(address: string): Promise<HeldCredential[] | null> {
  try {
    const raw = await AsyncStorage.getItem(heldCacheKey(address));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!Array.isArray(parsed)) return null;
    return parsed.map(cacheEntry).filter((h): h is HeldCredential => h !== null);
  } catch {
    return null;
  }
}

async function writeCache(address: string, held: HeldCredential[]): Promise<void> {
  try {
    await AsyncStorage.setItem(heldCacheKey(address), JSON.stringify(held.map((h) => ({ ...h, claim: null }))));
  } catch {
    // cache is best effort
  }
}

/** validUntil in seconds; null = forever. */
const untilOf = (i: InvitationView) => isoToSec(i.validUntil);

/**
 * Of several accepted invitations for one type (an org re-issued it), the one to show: a valid one
 * before an expired one, then the latest validUntil (forever wins), then the newest (later in `mine`).
 */
function better(a: { inv: InvitationView; index: number }, b: { inv: InvitationView; index: number }, nowSec: number): boolean {
  const ua = untilOf(a.inv);
  const ub = untilOf(b.inv);
  const va = ua === null || ua >= nowSec;
  const vb = ub === null || ub >= nowSec;
  if (va !== vb) return va;
  if (ua !== ub) return ua === null ? true : ub === null ? false : ua > ub;
  return a.index > b.index;
}

export type HolderState = { held: HeldCredential[]; pending: InvitationView[]; fromCache: boolean };

/**
 * `mine` → accepted invitations; one `holdsMany` decides public (held on chain) vs private.
 * Revoked and declined invitations are dropped; `invited` ones come back as `pending`.
 * Request failed → cache (or empty). Chain read failed → cached visibility per type (or private),
 * and the cache is left as it was.
 */
export async function loadHolder(account: SigningAccount, deps: HeldDeps = defaultDeps): Promise<HolderState> {
  if (!deps.configured()) return { held: [], pending: [], fromCache: false };
  const res = await deps.fetchMine(account);
  if (!res.ok) return { held: (await readCache(account.address)) ?? [], pending: [], fromCache: true };

  const accepted = res.data.filter((i) => i.state === 'accepted');
  const pending = res.data.filter((i) => i.state === 'invited');
  const typeIds = [...new Set(accepted.map((i) => i.type.typeId))];

  let onChain: Map<string, boolean> | null = null;
  try {
    const flags = await deps.reader().holdsMany(typeIds, account.address as Address);
    onChain = new Map(typeIds.map((id, n) => [id.toLowerCase(), flags[n] === true]));
  } catch {
    onChain = null;
  }
  const cachedVisibility = new Map(((await readCache(account.address)) ?? []).map((h) => [h.typeId.toLowerCase(), h.visibility]));
  const nowSec = Math.floor(Date.now() / 1000);

  // One entry per type; the list keeps the server order of the chosen invitations (badges rely on it).
  const chosen = new Map<string, { inv: InvitationView; index: number }>();
  accepted.forEach((inv, index) => {
    const key = inv.type.typeId.toLowerCase();
    const cur = chosen.get(key);
    if (!cur || better({ inv, index }, cur, nowSec)) chosen.set(key, { inv, index });
  });
  const held: HeldCredential[] = [...chosen.values()]
    .sort((a, b) => a.index - b.index)
    .map(({ inv: i }) => {
      const key = i.type.typeId.toLowerCase();
      const validUntil = untilOf(i);
      const expired = validUntil !== null && validUntil < nowSec;
      // The chain's `holds` is false once expired, so it cannot tell public from private then:
      // keep what was known before (cache), else private.
      const visibility: HeldCredential['visibility'] =
        onChain && !expired ? (onChain.get(key) ? 'public' : 'private') : cachedVisibility.get(key) ?? 'private';
      return {
        typeId: i.type.typeId,
        kind: i.type.kind,
        title: i.type.name,
        orgName: i.org?.name ?? null,
        imageUrl: i.type.imageUrl,
        recognised: i.type.recognised,
        visibility,
        validUntil,
        invitationId: i.id,
        claim: i.claim,
        benefits: Array.isArray(i.type.benefits) ? i.type.benefits : [],
        publicAllowed: i.type.publicClaimAllowed !== false,
      };
    });
  if (onChain) await writeCache(account.address, held);
  return { held, pending, fromCache: false };
}

export async function loadHeld(account: SigningAccount, deps: HeldDeps = defaultDeps): Promise<HeldCredential[]> {
  return (await loadHolder(account, deps)).held;
}

/** Called on logout. */
export async function clearHeld(address: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(heldCacheKey(address));
  } catch {
    // nothing to clear
  }
}

// ── another person's public credentials ──────────────────────────────────────

type DirectoryEntry = {
  typeId: Hex;
  kind: CredentialKind | null;
  name: string;
  imageUrl: string | null;
  orgName: string | null;
  recognised: boolean;
};

export const DIRECTORY_TTL_MS = 5 * 60_000;
const DIRECTORY_TIMEOUT_MS = 10_000;
let directory: { at: number; entries: DirectoryEntry[] } | null = null;

/** Test hook. */
export function __resetPublicDirectory(): void {
  directory = null;
}

async function publicDirectory(): Promise<DirectoryEntry[] | null> {
  if (directory && Date.now() - directory.at < DIRECTORY_TTL_MS) return directory.entries;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECTORY_TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/credentials/types`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { types?: unknown };
    if (!Array.isArray(json?.types)) return null;
    const entries = (json.types as DirectoryEntry[]).filter(
      (t) => t && typeof t.typeId === 'string' && /^0x[0-9a-fA-F]{64}$/.test(t.typeId) && typeof t.name === 'string',
    );
    directory = { at: Date.now(), entries };
    return entries;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Public credentials of another account: the public type directory names the types, one
 * `holdsMany` on chain decides. The server is never asked about the other person.
 */
export async function loadPublicHeld(
  address: Address,
  deps: Pick<HeldDeps, 'reader' | 'configured'> = defaultDeps,
): Promise<HeldCredential[]> {
  if (!deps.configured()) return [];
  const entries = await publicDirectory();
  if (!entries) return [];
  const types = entries.filter((t) => t.kind && !RESERVED.has(t.typeId.toLowerCase()));
  if (types.length === 0) return [];
  let flags: boolean[];
  try {
    flags = await deps.reader().holdsMany(types.map((t) => t.typeId), address);
  } catch {
    return [];
  }
  return types
    .filter((_, n) => flags[n] === true)
    .map((t) => ({
      typeId: t.typeId,
      kind: t.kind as CredentialKind,
      title: t.name,
      orgName: t.orgName ?? null,
      imageUrl: t.imageUrl ?? null,
      recognised: t.recognised === true,
      visibility: 'public' as const,
      // Chain `holds` is expiry-aware: whatever it reports as held is valid now. The exact date is
      // in the leaf only, which another person's device never sees.
      validUntil: null,
      invitationId: null,
      claim: null,
    }));
}

// ── hook ─────────────────────────────────────────────────────────────────────

/** Every mounted useHeld reloads when a screen changed what the person holds (accept, make public…). */
const changeListeners = new Set<() => void>();

export function announceHeldChanged(): void {
  changeListeners.forEach((l) => l());
}

type HookState = { owner: string; held: HeldCredential[]; pending: InvitationView[] };
/** `pending` absent = keep what is shown (the cache holds no invitations). */
type HookUpdate = { owner: string; held: HeldCredential[]; pending?: InvitationView[] };

const merge = (prev: HookState | null, u: HookUpdate): HookState => ({
  owner: u.owner,
  held: u.held,
  pending: u.pending ?? (prev?.owner === u.owner ? prev.pending : []),
});

/** The signed-in person's credentials. Does nothing while the gate is closed or loading. */
export function useHeld(): { held: HeldCredential[]; pending: InvitationView[]; refresh(): Promise<void>; loading: boolean } {
  const account = useActiveAccount();
  const gate = useCredentialsGate();
  const [state, setState] = useState<HookState | null>(null);
  const [loadingFor, setLoadingFor] = useState<string | null>(null);
  const address = account?.address?.toLowerCase();
  const open = gate === true && !!account;

  const load = useCallback(
    (onUpdate: (u: HookUpdate) => void): Promise<void> => {
      if (!account || gate !== true) return Promise.resolve();
      const owner = account.address.toLowerCase();
      return readCache(account.address)
        .then((cached) => {
          setLoadingFor(owner);
          if (cached) onUpdate({ owner, held: cached });
          return loadHolder(account);
        })
        .then((r) => onUpdate(r.fromCache ? { owner, held: r.held } : { owner, held: r.held, pending: r.pending }))
        .finally(() => setLoadingFor((cur) => (cur === owner ? null : cur)));
    },
    // account object identity changes on re-render; the address is what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, gate],
  );

  useEffect(() => {
    let cancelled = false;
    load((u) => {
      if (!cancelled) setState((prev) => merge(prev, u));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(() => load((u) => setState((prev) => merge(prev, u))).catch(() => undefined), [load]);

  useEffect(() => {
    const listener = () => {
      void refresh();
    };
    changeListeners.add(listener);
    return () => {
      changeListeners.delete(listener);
    };
  }, [refresh]);

  // A closed gate or another signed-in account never sees a previous list.
  const mine = open && state?.owner === address ? state : null;
  return { held: mine?.held ?? [], pending: mine?.pending ?? [], refresh, loading: open && loadingFor === address };
}
