/**
 * The connect choice for version-1 mini apps (manifest without an identity section).
 *
 * Every mini app opens with the connect dialog the first time a signed-in person starts it. A
 * version-2 app stores the answer on the node (identity grants, `asked`). A version-1 app has no
 * grant on the node, so its answer is remembered on the device, per app and account: once
 * answered, the dialog never shows again for that pair, and the person can change it any time
 * on the app's detail page. What is switched off is withheld: no name/picture without `profile`,
 * no account and no wallet requests without `address`. Apps must cope with both (fallbacks).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import type { MiniAppContext } from '@netizen-labs/miniapp-sdk';
import { CONSENT_COPY, type ConsentItem } from './miniapp-identity';

export const CONNECTION_KEY_PREFIX = 'miniapp.connected.v2:';

export type V1Choice = { profile: boolean; address: boolean };

export function connectionKey(appId: string, wallet: string): string {
  return `${CONNECTION_KEY_PREFIX}${appId}:${wallet.toLowerCase()}`;
}

type KV = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

/** The stored answer, or null when the person was never asked. A storage error counts as never asked. */
export async function readV1Choice(appId: string, wallet: string, kv: KV = AsyncStorage): Promise<V1Choice | null> {
  try {
    const raw = await kv.getItem(connectionKey(appId, wallet));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<V1Choice>;
    return { profile: j.profile === true, address: j.address === true };
  } catch {
    return null;
  }
}

/** Stores the answer. Never throws: a failed write only means the dialog shows again. */
export async function saveV1Choice(appId: string, wallet: string, choice: V1Choice, kv: KV = AsyncStorage): Promise<void> {
  try {
    await kv.setItem(connectionKey(appId, wallet), JSON.stringify(choice));
  } catch {
    // ignore
  }
}

/** The dialog rows for a version-1 app: name/picture and account, both on by default. */
export function v1ConnectItems(): ConsentItem[] {
  return [
    { key: 'profile', title: CONSENT_COPY.profileTitle, detail: CONSENT_COPY.profileDetail, privateNote: false, defaultOn: true },
    { key: 'address', title: CONSENT_COPY.addressTitle, detail: CONSENT_COPY.v1AddressDetail, privateNote: false, defaultOn: true },
  ];
}

/** A stable id per app and account that reveals neither the account nor links two apps. */
export function v1Pseudonym(appId: string, wallet: string): string {
  return `nz_${bytesToHex(sha256(utf8ToBytes(`roebel-miniapp-v1:${appId}:${wallet.toLowerCase()}`))).slice(0, 32)}`;
}

/**
 * The context user a version-1 app sees under `choice`: nothing before the dialog was answered,
 * the account only with `address` (else the pseudonym), name and picture only with `profile`.
 */
export function v1User(
  appId: string,
  address: string,
  choice: V1Choice | null,
  profile: { displayName?: string; avatarUrl?: string; isCitizen: boolean },
): MiniAppContext['user'] {
  if (!choice || (!choice.profile && !choice.address)) return null;
  const out: NonNullable<MiniAppContext['user']> = {
    id: choice.address ? address : v1Pseudonym(appId, address),
    isCitizen: profile.isCitizen,
  };
  if (choice.profile) {
    if (profile.displayName) out.displayName = profile.displayName;
    if (profile.avatarUrl) out.avatarUrl = profile.avatarUrl;
  }
  return out;
}
