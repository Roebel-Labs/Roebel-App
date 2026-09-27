/**
 * "Schlüssel sichern" that COMPLETES the backup: MACI + Nostr (+ commitment salt when the citizen
 * has a commitment), not only what this device happens to hold.
 *
 * Device test 2026-09-27 (Pixel 7, passkey session on legacy 0xc49d… via Safe 0xe3d1…): a fresh
 * install had only a Nostr key locally, so the old flow backed up `nostr` alone and the `maci` /
 * `salt` slots stayed empty forever — those keys come from DETERMINISTIC thirdweb signatures and a
 * passkey signature (randomized) must never be used to derive them.
 *
 * Per slot, in order:
 *   1. the key is on this device                          → back it up (as before)
 *   2. the server backup already has it                    → nothing to do
 *   3. neither: a thirdweb session for THIS identity is available (the device's stored inApp
 *      session, auto-connected silently without touching the active wallet, or the active
 *      thirdweb account)                                    → derive with the EXISTING thirdweb
 *      derivation, persist locally like today, wrap under the PRF, back up
 *   4. neither and no thirdweb session                     → `needsThirdweb`: the UI offers
 *      "Einmal mit Google/E-Mail bestätigen" and calls this again with that session.
 *
 * A backup-service failure THROWS (never read as "no backup"), and a thirdweb session for a
 * DIFFERENT account is refused (it would derive someone else's keys).
 *
 * Fingerprints: one for the backup read (its PRF output is reused for wrapping), one for the write.
 * thirdweb signatures are silent.
 *
 * Pure: every side effect is injected (key-completion-runtime.ts wires the real ones).
 */
import { isAddressEqual, type Address, type Hex } from 'viem';
import { backupDeviceSecrets, type BackupReport, type BackupSource, type ResolveDeps } from './derived-keys';
import { KEY_BACKUP_SLOTS, type KeyBackupSlot, type RemoteBackup, type RemoteRead } from './key-backup';

export const THIRDWEB_OTHER_ACCOUNT_MESSAGE =
  'Diese Google-/E-Mail-Anmeldung gehört zu einem anderen Konto. Bitte melde dich mit dem Konto an, mit dem du bisher die App genutzt hast.';

/** Slots a complete backup must hold: MACI + Nostr always, the salt only with a commitment. */
export function requiredKeySlots(hasCommitment: boolean): KeyBackupSlot[] {
  return hasCommitment ? ['maci', 'nostr', 'salt'] : ['maci', 'nostr'];
}

/** A thirdweb account that can re-run the existing deterministic derivation for a slot. */
export type ThirdwebKeySource = {
  address: string;
  /** Existing thirdweb derivation for `slot`; persists locally as today; returns the slot's stored bytes. */
  derive: (slot: KeyBackupSlot) => Promise<Uint8Array>;
};

export type CompletionDeps = Pick<ResolveDeps, 'storage' | 'getPrf' | 'wrap' | 'unwrap'> & {
  identity: string;
  remote?: RemoteBackup;
  /** This device's secrets per slot (derived-keys-runtime.deviceSecretSources). */
  sources: BackupSource[];
  hasCommitment: () => Promise<boolean>;
  /** A silent thirdweb session (never a login prompt); null = none on this device. */
  thirdweb: () => Promise<ThirdwebKeySource | null>;
};

export type CompletionResult =
  | { status: 'disabled' }
  | {
      status: 'needsThirdweb';
      required: KeyBackupSlot[];
      /** Required slots that exist nowhere yet and need a thirdweb session to derive. */
      missing: KeyBackupSlot[];
      /** Slots now in the backup (this run's uploads + what the server already held). */
      backedUp: KeyBackupSlot[];
      report: BackupReport;
    }
  | {
      status: 'done';
      required: KeyBackupSlot[];
      backedUp: KeyBackupSlot[];
      /** Slots derived from the thirdweb session in this run. */
      derived: KeyBackupSlot[];
      /** Every required slot is in the backup. */
      complete: boolean;
      report: BackupReport;
    };

const uniq = (xs: KeyBackupSlot[]) => KEY_BACKUP_SLOTS.filter((s) => xs.includes(s));

/** Serves the read we already paid a fingerprint for, so backupDeviceSecrets does not re-read. */
function withCachedRead(remote: RemoteBackup, read: RemoteRead): RemoteBackup {
  return { read: async () => read, write: (blobs, replace) => remote.write(blobs, replace) };
}

export async function completeKeyBackup(d: CompletionDeps): Promise<CompletionResult> {
  if (!d.remote) return { status: 'disabled' };
  const read = await d.remote.read(); // throws on a service failure — never "no backup"
  if (read.status === 'disabled') return { status: 'disabled' };

  const required = requiredKeySlots(await d.hasCommitment());
  const inBackup = read.status === 'found' ? (Object.keys(read.blobs) as KeyBackupSlot[]) : [];
  const local = new Map<KeyBackupSlot, Uint8Array>();
  for (const s of d.sources) {
    const v = await s.loadLocal();
    if (v && v.length > 0) local.set(s.slot, v);
  }
  const absent = uniq(d.sources.map((s) => s.slot)).filter((s) => !local.has(s) && !inBackup.includes(s));
  const mustDerive = absent.filter((s) => required.includes(s));

  const derivedSecrets = new Map<KeyBackupSlot, Uint8Array>();
  let thirdwebMissing = false;
  if (absent.length > 0) {
    const tw = await d.thirdweb();
    if (!tw) {
      thirdwebMissing = mustDerive.length > 0;
    } else {
      if (!isAddressEqual(tw.address as Address, d.identity as Address)) throw new Error(THIRDWEB_OTHER_ACCOUNT_MESSAGE);
      for (const slot of absent) {
        try {
          derivedSecrets.set(slot, await tw.derive(slot));
        } catch (e) {
          // An optional slot (salt without a commitment) must not block the required ones.
          if (required.includes(slot)) throw e;
        }
      }
    }
  }

  const sources: BackupSource[] = d.sources.map((s) =>
    derivedSecrets.has(s.slot) ? { slot: s.slot, loadLocal: async () => derivedSecrets.get(s.slot) as Uint8Array } : s,
  );
  const report = await backupDeviceSecrets(sources, {
    storage: d.storage,
    getPrf: async () => (read.prf as Hex | undefined) ?? d.getPrf(),
    remote: withCachedRead(d.remote, read),
    wrap: d.wrap,
    unwrap: d.unwrap,
  });
  if (report.status === 'disabled') return { status: 'disabled' };

  const backedUp = uniq([...report.saved, ...inBackup]);
  if (thirdwebMissing) {
    return { status: 'needsThirdweb', required, missing: mustDerive.filter((s) => !backedUp.includes(s)), backedUp, report };
  }
  return {
    status: 'done',
    required,
    backedUp,
    derived: uniq([...derivedSecrets.keys()]),
    complete: required.every((s) => backedUp.includes(s)),
    report,
  };
}

export const KEY_SLOT_NAMES: Record<KeyBackupSlot, string> = {
  maci: 'Abstimmungsschlüssel',
  nostr: 'Nostr-Schlüssel',
  salt: 'Bürger-Bestätigung',
};
const slotNames = (slots: KeyBackupSlot[]) => slots.map((s) => KEY_SLOT_NAMES[s]).join(', ');

/** German status line for the "Schlüssel sichern" buttons. */
export function describeCompletion(r: CompletionResult): { tone: 'info' | 'error' | 'success'; text: string } {
  if (r.status === 'disabled') return { tone: 'info', text: 'Die Schlüssel-Sicherung ist noch nicht freigeschaltet.' };
  if (r.report.conflicts.length > 0) {
    return {
      tone: 'error',
      text: `Auf dem Server liegt bereits ein anderer ${slotNames(r.report.conflicts)}. Er wurde nicht überschrieben – bitte melde dich bei uns.`,
    };
  }
  if (r.status === 'needsThirdweb') {
    return {
      tone: 'info',
      text:
        `${r.backedUp.length ? `Gesichert: ${slotNames(r.backedUp)}. ` : ''}Noch offen: ${slotNames(r.missing)}. ` +
        'Er entsteht aus deiner bisherigen Google-/E-Mail-Anmeldung. Bestätige sie einmal – danach bleibst du mit deinem Passkey angemeldet.',
    };
  }
  if (!r.complete) {
    return { tone: 'info', text: `Noch offen: ${slotNames(r.required.filter((s) => !r.backedUp.includes(s)))}.` };
  }
  return { tone: 'success', text: `Gesichert: ${slotNames(r.backedUp)}. Nur dein Passkey kann sie entsperren.` };
}
