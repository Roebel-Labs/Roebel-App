/**
 * "thirdweb trennen" — the IRREVERSIBLE last step: the thirdweb admin EOA is removed from the
 * legacy thirdweb account, leaving the passkey Safe (and, after 3 days, its guardians) as the
 * only way to control it. Fork proof: contracts/passkey-accounts/test/PasskeyDetach.t.sol.
 * Server: sponsor mode "detach" in apps/web/src/lib/passkey/sponsor-policy.ts (mode E).
 *
 * Mechanics (runDetach):
 *   1. read `getAllAdmins()`: exactly {EOA, Safe}. Any OTHER admin → stop BEFORE signing and list it.
 *   2. re-check the Safe's guardians (>= 2) and threshold (>= 2) — the sponsor refuses otherwise.
 *   3. the thirdweb admin EOA (`wallet.getAdminAccount()`, active thirdweb inApp session) signs
 *      SignerPermissionRequest{signer: EOA, isAdmin: 2} (domain "Account"/"1"/100/legacy).
 *   4. the Safe submits legacy.setPermissionsForSigner(req, sig) as ONE sponsored userOp.
 *   5. verify on chain: !isAdmin(EOA) && isAdmin(Safe) && getAllAdmins() == [Safe].
 *
 * The checklist (evaluateDetachChecklist) must be all green before the screen even offers step 3.
 * Every side effect is injected; detach-runtime.ts wires the real ones.
 */
import { bytesToHex, isAddressEqual, type Address, type Hex, type TypedDataDefinition } from 'viem';
import { encodeSetPermissions, signerPermissionTypedData, type SignerPermissionRequest } from './legacy-handover';
import { randomBytes } from './random';
import type { KeyBackupSlot } from './key-backup';
import type { PasskeyUserOpArgs, SponsoredCall } from './userop';

export const DETACH_MIN_GUARDIANS = 2;
export const DETACH_MIN_THRESHOLD = 2;
export const DETACH_CONFIRM_WORD = 'TRENNEN';

export const DETACH_EXPLANATION =
  'Danach kann nur noch dein Passkey — und nach 3 Tagen deine Vertrauenspersonen — dein Konto steuern. ' +
  'Google/E-Mail-Anmeldung funktioniert dann nicht mehr. Das kann man nicht rückgängig machen.';

export const DETACH_NEEDS_THIRDWEB_MESSAGE =
  'Für diesen Schritt musst du dich noch einmal mit Google/E-Mail anmelden: Deine bisherige Anmeldung ' +
  'muss ihre eigene Entfernung unterschreiben.';

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export type ChecklistId = 'passkeySynced' | 'guardians' | 'messages' | 'testAction' | 'keyBackup';

export type ChecklistInputs = {
  /** (1) explicit confirmation: the passkey is in Google Password Manager / iCloud Keychain. */
  passkeySyncedConfirmed: boolean;
  /** (2) live SRM reads of the Safe; null = not read yet / failed. */
  guardians: { count: number; threshold: number } | null;
  /** (3) Safe linked to the XMTP inbox (null = unknown), or the explicit "no DMs" confirmation. */
  xmtpLinked: boolean | null;
  noDmsConfirmed: boolean;
  /** (4) a sponsored passkey op succeeded in this app session. */
  sponsoredOpSucceeded: boolean;
  /** (5) slots this device holds locally, and the slots the server backup has (null = unknown / off). */
  localKeySlots: KeyBackupSlot[];
  backupSlots: KeyBackupSlot[] | null;
  /**
   * (5) slots a complete backup must hold (key-completion.requiredKeySlots): maci + nostr, plus
   * salt when the citizen has a commitment. Default maci + nostr.
   */
  requiredKeySlots?: KeyBackupSlot[];
};

const SLOT_NAMES: Record<KeyBackupSlot, string> = {
  maci: 'Abstimmungsschlüssel',
  nostr: 'Nostr-Schlüssel',
  salt: 'Bürger-Bestätigung',
};

export type ChecklistItem = { id: ChecklistId; ok: boolean; title: string; detail: string };

export function evaluateDetachChecklist(i: ChecklistInputs): { items: ChecklistItem[]; allGreen: boolean } {
  const g = i.guardians;
  const guardiansOk = !!g && g.count >= DETACH_MIN_GUARDIANS && g.threshold >= DETACH_MIN_THRESHOLD;
  const required = i.requiredKeySlots ?? (['maci', 'nostr'] as KeyBackupSlot[]);
  const mustHave = [...new Set<KeyBackupSlot>([...required, ...i.localKeySlots])];
  const missingBackup = i.backupSlots ? mustHave.filter((s) => !i.backupSlots!.includes(s)) : mustHave;
  const backupOk = i.backupSlots !== null && missingBackup.length === 0;
  const items: ChecklistItem[] = [
    {
      id: 'passkeySynced',
      ok: i.passkeySyncedConfirmed,
      title: 'Passkey ist gesichert',
      detail:
        'Passkey ist im Google-Passwortmanager / iCloud-Schlüsselbund gesichert. Prüfe das in den ' +
        'Einstellungen deines Telefons – nur so übersteht dein Konto einen Gerätewechsel.',
    },
    {
      id: 'guardians',
      ok: guardiansOk,
      title: 'Mindestens 2 Vertrauenspersonen, 2 müssen zustimmen',
      detail: g
        ? `Aktuell: ${g.count} Vertrauenspersonen, ${g.threshold} müssen zustimmen.`
        : 'Vertrauenspersonen konnten nicht gelesen werden.',
    },
    {
      id: 'messages',
      ok: i.xmtpLinked === true || i.noDmsConfirmed,
      title: 'Private Nachrichten übertragen',
      detail:
        i.xmtpLinked === true
          ? 'Deine privaten Nachrichten laufen über deinen Passkey.'
          : i.noDmsConfirmed
            ? 'Du nutzt keine Direktnachrichten.'
            : 'Übertrage deine Nachrichten auf den Passkey – oder bestätige „Ich nutze keine Direktnachrichten“.',
    },
    {
      id: 'testAction',
      ok: i.sponsoredOpSucceeded,
      title: 'Passkey-Test erfolgreich',
      detail: i.sponsoredOpSucceeded
        ? 'Dein Passkey hat in dieser Sitzung erfolgreich eine Aktion ausgeführt.'
        : 'Führe eine Test-Aktion mit deinem Passkey aus (ändert nichts an deinem Konto).',
    },
    {
      id: 'keyBackup',
      ok: backupOk,
      title: 'Schlüssel gesichert',
      detail:
        i.backupSlots === null
          ? 'Die Schlüssel-Sicherung ist nicht erreichbar.'
          : backupOk
            ? 'Abstimmungs- und Nostr-Schlüssel sind verschlüsselt gesichert.'
            : `Noch nicht gesichert: ${missingBackup.map((s) => SLOT_NAMES[s]).join(', ')}. Tippe auf „Schlüssel sichern“, damit Abstimmen und Beiträge auch auf einem neuen Gerät funktionieren.`,
    },
  ];
  return { items, allGreen: items.every((it) => it.ok) };
}

// ---------------------------------------------------------------------------
// "In this session" proof for checklist item (4)
// ---------------------------------------------------------------------------

let sponsoredOpAt: number | null = null;

/** Called after every successful sponsored passkey userOp (adapter sends, the test action). */
export function markSponsoredOpSucceeded(now = Date.now()): void {
  sponsoredOpAt = now;
}
export function sponsoredOpSucceededThisSession(): boolean {
  return sponsoredOpAt !== null;
}
/** Test helper. */
export function resetSponsoredOpProof(): void {
  sponsoredOpAt = null;
}

// ---------------------------------------------------------------------------
// Detach request + runner
// ---------------------------------------------------------------------------

/** Request validity: 5 min backdated (clock skew), 1 h window — same as the handover. */
export function buildDetachRequest(eoa: Address, nowSec: number): SignerPermissionRequest {
  const now = BigInt(Math.floor(nowSec));
  return {
    signer: eoa,
    isAdmin: 2,
    approvedTargets: [],
    nativeTokenLimitPerTransaction: 0n,
    permissionStartTimestamp: 0n,
    permissionEndTimestamp: 0n,
    reqValidityStartTimestamp: now - 300n,
    reqValidityEndTimestamp: now + 3600n,
    uid: bytesToHex(randomBytes(32)),
  };
}

export type DetachDeps = {
  legacy: Address;
  safe: Address;
  /** The thirdweb admin EOA (`wallet.getAdminAccount()`), the admin being removed. */
  eoa: Address;
  getAllAdmins: (legacy: Address) => Promise<readonly Address[]>;
  isAdmin: (legacy: Address, signer: Address) => Promise<boolean>;
  readGuardianState: (safe: Address) => Promise<{ count: number; threshold: number }>;
  /** EIP-712 signature by the admin EOA (never the smart account: 1271 would fail). */
  signTypedDataAsEoa: (typed: TypedDataDefinition<any, any>) => Promise<Hex>;
  /** One sponsored userOp from the Safe (sendPasskeyUserOp with the session's credential / key / owner). */
  sendUserOp: (args: Pick<PasskeyUserOpArgs, 'legacy' | 'calls'>) => Promise<{ txHash: Hex }>;
  now?: () => number;
};

export type DetachResult =
  | { status: 'done'; txHash: Hex | null; alreadyDetached: boolean }
  | { status: 'otherAdmins'; admins: Address[] }
  | { status: 'error'; message: string };

const sameSet = (a: readonly Address[], b: readonly Address[]) =>
  a.length === b.length && a.every((x) => b.some((y) => isAddressEqual(x, y)));

/** Guard: the only request this module ever signs removes the EOA, never the Safe. */
export function assertDetachRequest(req: SignerPermissionRequest, eoa: Address, safe: Address): void {
  if (req.isAdmin !== 2 || !isAddressEqual(req.signer, eoa) || isAddressEqual(req.signer, safe)) {
    throw new Error('refusing to sign anything but the removal of the thirdweb admin EOA');
  }
}

export async function runDetach(d: DetachDeps): Promise<DetachResult> {
  if (isAddressEqual(d.eoa, d.safe)) return { status: 'error', message: 'Ungültige Anmeldung.' };
  let admins: readonly Address[];
  try {
    admins = await d.getAllAdmins(d.legacy);
  } catch {
    return { status: 'error', message: 'Die Verwalter deines Kontos konnten nicht gelesen werden. Bitte prüfe deine Verbindung.' };
  }
  const safeIsAdmin = admins.some((a) => isAddressEqual(a, d.safe));
  if (!safeIsAdmin) return { status: 'error', message: 'Dein Passkey ist kein Verwalter dieses Kontos.' };
  if (sameSet(admins, [d.safe])) return { status: 'done', txHash: null, alreadyDetached: true };
  const others = admins.filter((a) => !isAddressEqual(a, d.safe) && !isAddressEqual(a, d.eoa));
  if (others.length > 0) return { status: 'otherAdmins', admins: others.map((a) => a) };
  if (!admins.some((a) => isAddressEqual(a, d.eoa))) {
    return { status: 'error', message: 'Die angemeldete Google/E-Mail-Anmeldung ist kein Verwalter dieses Kontos.' };
  }

  let g: { count: number; threshold: number };
  try {
    g = await d.readGuardianState(d.safe);
  } catch {
    return { status: 'error', message: 'Deine Vertrauenspersonen konnten nicht gelesen werden.' };
  }
  if (g.count < DETACH_MIN_GUARDIANS || g.threshold < DETACH_MIN_THRESHOLD) {
    return { status: 'error', message: 'Du brauchst mindestens 2 Vertrauenspersonen, von denen 2 zustimmen müssen.' };
  }

  const req = buildDetachRequest(d.eoa, (d.now ?? (() => Date.now() / 1000))());
  assertDetachRequest(req, d.eoa, d.safe);
  let sig: Hex;
  try {
    sig = await d.signTypedDataAsEoa(signerPermissionTypedData(d.legacy, req));
  } catch {
    return { status: 'error', message: 'Deine Google/E-Mail-Anmeldung konnte nicht unterschreiben. Bitte versuche es erneut.' };
  }

  const call: SponsoredCall = { to: d.legacy, data: encodeSetPermissions(req, sig) };
  let txHash: Hex;
  try {
    ({ txHash } = await d.sendUserOp({ legacy: d.legacy, calls: [call] }));
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (name === 'PasskeyCancelledError') return { status: 'error', message: 'Vorgang abgebrochen. Es wurde nichts geändert.' };
    return { status: 'error', message: 'Das Trennen ist fehlgeschlagen. Es wurde nichts geändert.' };
  }

  // Verify on chain (the op may land but revert inside; never report success unverified).
  try {
    const [eoaAdmin, safeAdmin, after] = await Promise.all([
      d.isAdmin(d.legacy, d.eoa),
      d.isAdmin(d.legacy, d.safe),
      d.getAllAdmins(d.legacy),
    ]);
    if (eoaAdmin || !safeAdmin || !sameSet(after, [d.safe])) {
      return { status: 'error', message: 'Die Blockchain zeigt die Trennung noch nicht. Bitte prüfe es gleich noch einmal.' };
    }
  } catch {
    return { status: 'error', message: 'Die Trennung wurde gesendet, konnte aber nicht geprüft werden. Bitte öffne die Seite erneut.' };
  }
  return { status: 'done', txHash, alreadyDetached: false };
}
