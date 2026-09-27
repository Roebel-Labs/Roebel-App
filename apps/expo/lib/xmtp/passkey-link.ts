/**
 * XMTP on a passkey session ("Nachrichten auf Passkey übertragen").
 *
 * A migrated person's XMTP inbox belongs to the LEGACY thirdweb account (an SCW identity verified
 * via ERC-1271 on Gnosis). Under a passkey session that account cannot sign any more (its
 * isValidSignature is ECDSA-only; the Safe-admin envelope is our own server rule, XMTP does not
 * know it). So the passkey Safe is ADDED to the same inbox as a second SCW identity
 * (`client.addAccount(safeSigner)`, @xmtp/react-native-sdk 5.7.0). The Safe signs like any
 * Gnosis smart account: EIP-191 text → `isValidSignature(hashMessage(text), sig)` on chain 100,
 * which a passkey Safe answers through its CompatibilityFallbackHandler (the recipe fork-proven
 * in contracts/passkey-accounts/test/GuardianErc1271.t.sol).
 *
 * addAccount needs an existing installation of the inbox on this device (it signs as the existing
 * member) plus the NEW identity's signature; the legacy account itself does not sign. After that:
 *   - a device with the local XMTP db keeps using `Client.build(legacy)` (no signature);
 *   - a device without it registers a new installation with `Client.create(safeSigner)`, which
 *     resolves to the same inbox because the Safe is one of its identities.
 * Until the Safe is linked, DMs stay OFF on a legacy passkey session (Supabase rail + German hint).
 *
 * Pure: SDK classes and signing are injected.
 */
import { hashMessage, isAddressEqual, type Address, type Hex } from 'viem';

export const XMTP_PASSKEY_CHAIN_ID = 100;

export const XMTP_PASSKEY_LINK_HINT =
  'Private Nachrichten sind mit deinem Passkey noch nicht verbunden. Öffne Einstellungen → Passkey & ' +
  'Wiederherstellung und tippe auf „Nachrichten auf Passkey übertragen“. Bis dahin laufen deine ' +
  'Nachrichten wie gewohnt über den Röbel-Server.';

export const XMTP_LINK_NEEDS_INSTALLATION_MESSAGE =
  'Auf diesem Gerät sind deine privaten Nachrichten noch nicht eingerichtet. Melde dich einmal mit ' +
  'Google/E-Mail an, aktiviere „Private Nachrichten“ und übertrage sie dann auf deinen Passkey.';

export const XMTP_LINK_SAFE_NOT_DEPLOYED_MESSAGE =
  'Dein Passkey-Konto ist auf der Blockchain noch nicht aktiv. Schließe zuerst die Passkey-Einrichtung ab.';

/** Legacy passkey session whose Safe is not (yet) an identity of the legacy inbox. */
export class XmtpPasskeyLinkNeededError extends Error {
  constructor() {
    super(XMTP_PASSKEY_LINK_HINT);
    this.name = 'XmtpPasskeyLinkNeededError';
  }
}

/** Structural subset of the SDK's `Signer`. */
export type ScwSigner = {
  getIdentifier: () => Promise<unknown>;
  getChainId: () => number;
  getBlockNumber: () => undefined;
  signerType: () => 'SCW';
  signMessage: (message: string) => Promise<{ signature: string }>;
};

/**
 * The passkey Safe as an XMTP SCW signer. `signHashAsSafe(hash)` must return the Safe's OWN
 * ERC-1271 signature over `hash` (never the Safe-admin envelope: XMTP calls isValidSignature on
 * the Safe itself).
 */
export function makeSafeScwSigner(
  sdk: { PublicIdentity: new (identifier: string, kind: 'ETHEREUM') => unknown },
  safe: Address,
  signHashAsSafe: (hash: Hex) => Promise<Hex>,
): ScwSigner {
  return {
    getIdentifier: async () => new sdk.PublicIdentity(safe, 'ETHEREUM'),
    getChainId: () => XMTP_PASSKEY_CHAIN_ID,
    getBlockNumber: () => undefined,
    signerType: () => 'SCW',
    signMessage: async (message: string) => ({ signature: await signHashAsSafe(hashMessage(message)) }),
  };
}

/** Is `safe` one of the inbox identities (InboxState.identities[].identifier)? */
export function inboxHasIdentity(identities: ReadonlyArray<{ identifier: string }>, safe: Address): boolean {
  return identities.some((i) => typeof i.identifier === 'string' && /^0x[0-9a-fA-F]{40}$/.test(i.identifier) && isAddressEqual(i.identifier as Address, safe));
}

export type XmtpPasskeyPlan =
  /** Not a passkey session: the existing thirdweb flow, unchanged. */
  | { kind: 'thirdweb' }
  /** Passkey-only / moved identity: the adapter account IS the Safe and signs as itself. */
  | { kind: 'safeIdentity' }
  /** Legacy identity, Safe linked: build(legacy) or create(Safe signer). */
  | { kind: 'legacyViaSafe' }
  /** Legacy identity, Safe not linked yet: DMs off + hint. */
  | { kind: 'linkNeeded' };

export function planXmtpForPasskey(
  session: { safe: Address; identity: Address } | null,
  safeLinked: boolean,
): XmtpPasskeyPlan {
  if (!session) return { kind: 'thirdweb' };
  if (isAddressEqual(session.safe, session.identity)) return { kind: 'safeIdentity' };
  return safeLinked ? { kind: 'legacyViaSafe' } : { kind: 'linkNeeded' };
}

// Device marker: this device linked (or saw linked) `safe` for `legacy`.
export const PASSKEY_LINK_PREFIX = '@xmtp_passkey_linked_';

export type LinkStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export async function readPasskeyLinkMarker(storage: LinkStorage, legacy: string, safe: Address): Promise<boolean> {
  const v = await storage.getItem(`${PASSKEY_LINK_PREFIX}${legacy.toLowerCase()}`);
  return !!v && /^0x[0-9a-fA-F]{40}$/.test(v) && isAddressEqual(v as Address, safe);
}

export async function writePasskeyLinkMarker(storage: LinkStorage, legacy: string, safe: Address): Promise<void> {
  await storage.setItem(`${PASSKEY_LINK_PREFIX}${legacy.toLowerCase()}`, safe.toLowerCase());
}

/**
 * Linked = the device marker says so, or the network maps the Safe to the SAME inbox id as the
 * legacy account (static lookups, no signature).
 */
export async function isSafeLinked(
  p: { legacy: Address; safe: Address; storage: LinkStorage; inboxIdOf: (address: Address) => Promise<string | null> },
): Promise<boolean> {
  if (await readPasskeyLinkMarker(p.storage, p.legacy, p.safe)) return true;
  const [legacyInbox, safeInbox] = await Promise.all([p.inboxIdOf(p.legacy), p.inboxIdOf(p.safe)]);
  const linked = !!legacyInbox && !!safeInbox && legacyInbox === safeInbox;
  if (linked) await writePasskeyLinkMarker(p.storage, p.legacy, p.safe);
  return linked;
}
