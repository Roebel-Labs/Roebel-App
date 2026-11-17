/**
 * Native edge of the backup file: share sheet, document picker and native PBKDF2.
 *
 * expo-sharing and expo-document-picker are new native modules in this store build. An OTA can
 * run this JS on an older binary that lacks them, and their packages call requireNativeModule at
 * evaluation time, which crashes. So: nothing here imports them (or react-native-quick-crypto) at
 * module top level; `backupFileSupport()` probes the native modules with
 * requireOptionalNativeModule, and the UI renders a button only when the probe says yes.
 *
 * The temporary export file holds ciphertext only and is deleted after sharing, whatever the
 * outcome. A picked file is size-checked before it is read and its cached copy is deleted.
 */
// expo-modules-core ships with expo (transitive, hoisted); lib/xmtp/native.ts uses the same import.
// eslint-disable-next-line import/no-unresolved
import { requireOptionalNativeModule } from 'expo-modules-core';
import { BACKUP_FORMAT_MESSAGE, BACKUP_MAX_FILE_BYTES, type Pbkdf2 } from './backup-file';

export const BACKUP_READ_ERROR_MESSAGE = 'Die Datei konnte nicht gelesen werden.';

/** The subset of expo-file-system/legacy this module uses (injectable for tests). */
export type BackupFs = {
  cacheDirectory: string | null;
  writeAsStringAsync: (uri: string, content: string) => Promise<void>;
  readAsStringAsync: (uri: string) => Promise<string>;
  deleteAsync: (uri: string, options?: { idempotent?: boolean }) => Promise<void>;
  getInfoAsync: (uri: string) => Promise<{ exists: boolean; size?: number }>;
};

type Sharing = {
  shareAsync: (uri: string, options?: { mimeType?: string; UTI?: string; dialogTitle?: string }) => Promise<void>;
};

type PickerAsset = { uri: string; size?: number | null };
type Picker = {
  getDocumentAsync: (options: {
    type: string[];
    copyToCacheDirectory: boolean;
    multiple: boolean;
  }) => Promise<{ canceled: boolean; assets: PickerAsset[] | null }>;
};

export type PickResult = { status: 'picked'; content: string } | { status: 'cancelled' } | { status: 'error'; message: string };

function probe(name: string): boolean {
  try {
    return requireOptionalNativeModule(name) !== null;
  } catch {
    return false;
  }
}

/** Which backup-file buttons the running binary can back. Never throws. */
export function backupFileSupport(): { share: boolean; pick: boolean } {
  return { share: probe('ExpoSharing'), pick: probe('ExpoDocumentPicker') };
}

function defaultFs(): BackupFs {
  return require('expo-file-system/legacy') as BackupFs;
}

async function deleteQuietly(fs: BackupFs, uri: string): Promise<void> {
  try {
    await fs.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best effort: the file is ciphertext only and lives in the cache directory.
  }
}

/**
 * Writes the (already encrypted) backup to the cache directory, opens the share sheet and deletes
 * the file afterwards. A resolved share counts as 'shared' (iOS does not report a dismissed
 * sheet); a rejected share is 'dismissed'. A failing write rejects.
 */
export async function shareBackupFile(
  p: { fileName: string; content: string },
  deps?: { fs: BackupFs; sharing: Sharing },
): Promise<'shared' | 'dismissed'> {
  if (!/^[A-Za-z0-9._-]+$/.test(p.fileName) || p.fileName.startsWith('.')) {
    throw new Error('invalid backup file name');
  }
  if (!deps && !backupFileSupport().share) throw new Error('sharing is not available in this app build');
  const fs = deps?.fs ?? defaultFs();
  const sharing = deps?.sharing ?? (require('expo-sharing') as Sharing);
  if (!fs.cacheDirectory) throw new Error('no cache directory');
  const uri = `${fs.cacheDirectory}${p.fileName}`;
  try {
    await fs.writeAsStringAsync(uri, p.content);
    try {
      await sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Backup-Datei speichern' });
      return 'shared';
    } catch {
      return 'dismissed';
    }
  } finally {
    await deleteQuietly(fs, uri);
  }
}

/**
 * Lets the user pick a backup file. The size is checked before the file is read (16 KB max), and
 * the picker's cached copy is deleted. Never throws.
 */
export async function pickBackupFile(deps?: { fs: BackupFs; picker: Picker }): Promise<PickResult> {
  let fs: BackupFs;
  let picker: Picker;
  try {
    if (!deps && !backupFileSupport().pick) return { status: 'error', message: BACKUP_READ_ERROR_MESSAGE };
    fs = deps?.fs ?? defaultFs();
    picker = deps?.picker ?? (require('expo-document-picker') as Picker);
  } catch {
    return { status: 'error', message: BACKUP_READ_ERROR_MESSAGE };
  }

  let asset: PickerAsset | undefined;
  try {
    const result = await picker.getDocumentAsync({
      type: ['application/json', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) return { status: 'cancelled' };
    asset = result.assets[0];
  } catch {
    return { status: 'error', message: BACKUP_READ_ERROR_MESSAGE };
  }

  try {
    if (typeof asset.size === 'number' && asset.size > BACKUP_MAX_FILE_BYTES) {
      return { status: 'error', message: BACKUP_FORMAT_MESSAGE };
    }
    const info = await fs.getInfoAsync(asset.uri);
    if (!info.exists || typeof info.size !== 'number') return { status: 'error', message: BACKUP_READ_ERROR_MESSAGE };
    if (info.size > BACKUP_MAX_FILE_BYTES) return { status: 'error', message: BACKUP_FORMAT_MESSAGE };
    const content = await fs.readAsStringAsync(asset.uri);
    // The size could change between the check and the read; check the bytes actually read too.
    if (new TextEncoder().encode(content).length > BACKUP_MAX_FILE_BYTES) {
      return { status: 'error', message: BACKUP_FORMAT_MESSAGE };
    }
    return { status: 'picked', content };
  } catch {
    return { status: 'error', message: BACKUP_READ_ERROR_MESSAGE };
  } finally {
    await deleteQuietly(fs, asset.uri);
  }
}

type QuickCryptoPbkdf2 = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keylen: number,
  digest: string,
  callback: (err: Error | null, key?: Uint8Array) => void,
) => void;

/**
 * PBKDF2-HMAC-SHA256 through react-native-quick-crypto (asynchronous, off the JS thread).
 * The package is required lazily so jest and module import never load the native module.
 */
export const pbkdf2Native: Pbkdf2 = (password, salt, iterations, length) =>
  new Promise<Uint8Array>((resolve, reject) => {
    try {
      const mod = require('react-native-quick-crypto') as { default?: { pbkdf2: QuickCryptoPbkdf2 }; pbkdf2?: QuickCryptoPbkdf2 };
      const pbkdf2 = mod.default?.pbkdf2 ?? mod.pbkdf2;
      if (!pbkdf2) throw new Error('pbkdf2 is not available');
      pbkdf2(password, salt, iterations, length, 'sha256', (err, key) => {
        if (err || !key) {
          reject(err ?? new Error('pbkdf2 returned no key'));
          return;
        }
        resolve(new Uint8Array(key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength)));
      });
    } catch (e) {
      reject(e);
    }
  });
