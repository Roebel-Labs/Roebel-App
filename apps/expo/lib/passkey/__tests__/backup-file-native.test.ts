/**
 * The backup file's native edge: share sheet, document picker, native PBKDF2. The two Expo
 * packages are new in this store build, so an OTA can carry this code onto a binary without
 * them: detection must answer "no" without throwing, and importing the module must load none
 * of the native packages (Review Focus 5). Sharing that fails or is dismissed must still delete
 * the temporary file (Review Focus 4).
 */
import { pbkdf2Sync } from 'node:crypto';
import { BACKUP_FORMAT_MESSAGE, BACKUP_MAX_FILE_BYTES } from '../backup-file';
import type { BackupFs, pickBackupFile as PickFn, shareBackupFile as ShareFn } from '../backup-file-native';

// Required lazily: a top-level import would pin the real expo-modules-core for the whole file and
// defeat the per-test doMock of the native probe below.
const shareBackupFile: typeof ShareFn = (...a) => require('../backup-file-native').shareBackupFile(...a);
const pickBackupFile: typeof PickFn = (...a) => require('../backup-file-native').pickBackupFile(...a);

jest.mock('expo-sharing', () => {
  throw new Error('expo-sharing must not load on import');
});
jest.mock('expo-document-picker', () => {
  throw new Error('expo-document-picker must not load on import');
});
jest.mock('react-native-quick-crypto', () => {
  throw new Error('react-native-quick-crypto must not load on import');
});

type FakeFs = BackupFs & { files: Map<string, string>; reads: string[] };

function fakeFs(initial: Record<string, string> = {}): FakeFs {
  const files = new Map(Object.entries(initial));
  const reads: string[] = [];
  return {
    files,
    reads,
    cacheDirectory: 'file:///cache/',
    writeAsStringAsync: async (uri, content) => {
      files.set(uri, content);
    },
    readAsStringAsync: async (uri) => {
      reads.push(uri);
      const c = files.get(uri);
      if (c === undefined) throw new Error('no such file');
      return c;
    },
    deleteAsync: async (uri) => {
      files.delete(uri);
    },
    getInfoAsync: async (uri) => {
      const c = files.get(uri);
      return c === undefined ? { exists: false } : { exists: true, size: Buffer.byteLength(c, 'utf8') };
    },
  };
}

function pickerFor(uri: string, size: number | undefined) {
  return {
    getDocumentAsync: async () => ({
      canceled: false as const,
      assets: [{ uri, size, name: 'backup.json', mimeType: 'application/json' }],
    }),
  };
}

describe('backupFileSupport', () => {
  afterEach(() => {
    jest.dontMock('expo-modules-core');
  });

  it('reports no support when the native modules are missing, without throwing (OTA on an older binary)', () => {
    jest.isolateModules(() => {
      jest.doMock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));
      expect(require('../backup-file-native').backupFileSupport()).toEqual({ share: false, pick: false });
    });
  });

  it('reports each module by its native name', () => {
    jest.isolateModules(() => {
      const probe = jest.fn((name: string) => (name === 'ExpoSharing' ? {} : null));
      jest.doMock('expo-modules-core', () => ({ requireOptionalNativeModule: probe }));
      expect(require('../backup-file-native').backupFileSupport()).toEqual({ share: true, pick: false });
      expect(probe.mock.calls.map((c) => c[0]).sort()).toEqual(['ExpoDocumentPicker', 'ExpoSharing']);
    });
  });

  it('answers no when the probe itself throws', () => {
    jest.isolateModules(() => {
      jest.doMock('expo-modules-core', () => ({
        requireOptionalNativeModule: () => {
          throw new Error('boom');
        },
      }));
      expect(require('../backup-file-native').backupFileSupport()).toEqual({ share: false, pick: false });
    });
  });
});

describe('shareBackupFile', () => {
  it('share writes ciphertext only and always deletes the temporary file', async () => {
    const fs = fakeFs();
    await expect(
      shareBackupFile(
        { fileName: 'a.json', content: '{"x":1}' },
        {
          fs,
          sharing: {
            shareAsync: async () => {
              throw new Error('dismissed');
            },
          },
        },
      ),
    ).resolves.toBe('dismissed');
    expect(fs.files.size).toBe(0);
    expect(
      await shareBackupFile({ fileName: 'a.json', content: '{"x":1}' }, { fs, sharing: { shareAsync: async () => undefined } }),
    ).toBe('shared');
    expect(fs.files.size).toBe(0);
  });

  it('shares exactly the given content as JSON from the cache directory', async () => {
    const fs = fakeFs();
    const seen: { uri: string; content: string | undefined; options: unknown }[] = [];
    const sharing = {
      shareAsync: async (uri: string, options?: unknown) => {
        seen.push({ uri, content: fs.files.get(uri), options });
      },
    };
    await shareBackupFile({ fileName: 'konto-backup.json', content: '{"c":"abc"}' }, { fs, sharing });
    expect(seen).toEqual([
      {
        uri: 'file:///cache/konto-backup.json',
        content: '{"c":"abc"}',
        options: { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Backup-Datei speichern' },
      },
    ]);
  });

  it('deletes the temporary file when deleting fails once and still returns the share result', async () => {
    const fs = fakeFs();
    const realDelete = fs.deleteAsync;
    fs.deleteAsync = async (uri, opts) => {
      await realDelete(uri, opts);
      throw new Error('delete failed');
    };
    await expect(
      shareBackupFile({ fileName: 'a.json', content: '{}' }, { fs, sharing: { shareAsync: async () => undefined } }),
    ).resolves.toBe('shared');
  });

  it('a failing write rejects (nothing to mark as exported) and leaves no file', async () => {
    const fs = fakeFs();
    fs.writeAsStringAsync = async (uri) => {
      fs.files.set(uri, 'partial');
      throw new Error('disk full');
    };
    const shareAsync = jest.fn(async () => undefined);
    await expect(shareBackupFile({ fileName: 'a.json', content: '{}' }, { fs, sharing: { shareAsync } })).rejects.toThrow();
    expect(shareAsync).not.toHaveBeenCalled();
    expect(fs.files.size).toBe(0);
  });

  it('refuses a file name that is not a plain name', async () => {
    const fs = fakeFs();
    await expect(
      shareBackupFile({ fileName: '../x.json', content: '{}' }, { fs, sharing: { shareAsync: async () => undefined } }),
    ).rejects.toThrow();
    expect(fs.files.size).toBe(0);
  });
});

describe('pickBackupFile', () => {
  it('pick: cancel, an oversized file and a readable file', async () => {
    expect(await pickBackupFile({ fs: fakeFs(), picker: { getDocumentAsync: async () => ({ canceled: true, assets: null }) } })).toEqual({
      status: 'cancelled',
    });
    expect((await pickBackupFile({ fs: fakeFs({ 'c/big': 'x'.repeat(20_000) }), picker: pickerFor('c/big', 20_000) })).status).toBe('error');
    expect(await pickBackupFile({ fs: fakeFs({ 'c/ok': '{"a":1}' }), picker: pickerFor('c/ok', 7) })).toEqual({
      status: 'picked',
      content: '{"a":1}',
    });
  });

  it('checks the size before reading and deletes the cached copy', async () => {
    const fs = fakeFs({ 'c/big': 'x'.repeat(BACKUP_MAX_FILE_BYTES + 1) });
    // The picker does not report a size: the file system's size decides, still before any read.
    const r = await pickBackupFile({ fs, picker: pickerFor('c/big', undefined) });
    expect(r).toEqual({ status: 'error', message: BACKUP_FORMAT_MESSAGE });
    expect(fs.reads).toEqual([]);
    expect(fs.files.has('c/big')).toBe(false);
  });

  it('a file of exactly 16 KB is read', async () => {
    const content = 'x'.repeat(BACKUP_MAX_FILE_BYTES);
    const fs = fakeFs({ 'c/edge': content });
    expect(await pickBackupFile({ fs, picker: pickerFor('c/edge', BACKUP_MAX_FILE_BYTES) })).toEqual({ status: 'picked', content });
    expect(fs.files.size).toBe(0);
  });

  it('a picker that throws or a read that fails becomes an error, never a throw', async () => {
    const throwing = {
      getDocumentAsync: async () => {
        throw new Error('picker broke');
      },
    };
    expect((await pickBackupFile({ fs: fakeFs(), picker: throwing })).status).toBe('error');
    const fs = fakeFs();
    expect((await pickBackupFile({ fs, picker: pickerFor('c/missing', 5) })).status).toBe('error');
  });

  it('an empty asset list counts as cancelled', async () => {
    expect(await pickBackupFile({ fs: fakeFs(), picker: { getDocumentAsync: async () => ({ canceled: false, assets: [] }) } })).toEqual({
      status: 'cancelled',
    });
  });
});

describe('pbkdf2Native', () => {
  it('loads react-native-quick-crypto only when called and matches PBKDF2-HMAC-SHA256', async () => {
    await jest.isolateModulesAsync(async () => {
      const calls: unknown[][] = [];
      jest.doMock('react-native-quick-crypto', () => {
        const nodeCrypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
        return {
          __esModule: true,
          default: {
            pbkdf2: (...args: unknown[]) => {
              calls.push(args.slice(2, 5));
              (nodeCrypto.pbkdf2 as (...a: unknown[]) => void)(...args);
            },
          },
        };
      });
      const { pbkdf2Native } = require('../backup-file-native');
      const password = new TextEncoder().encode('Müritz-Hecht-2026');
      const salt = new Uint8Array(16).fill(7);
      const key: Uint8Array = await pbkdf2Native(password, salt, 1000, 32);
      expect(key).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(key).toString('hex')).toBe(pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex'));
      expect(calls).toEqual([[1000, 32, 'sha256']]);
    });
  });

  it('rejects when the native call reports an error', async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('react-native-quick-crypto', () => ({
        __esModule: true,
        default: {
          pbkdf2: (_p: unknown, _s: unknown, _i: unknown, _l: unknown, _d: unknown, cb: (e: Error | null) => void) => cb(new Error('native')),
        },
      }));
      const { pbkdf2Native } = require('../backup-file-native');
      await expect(pbkdf2Native(new Uint8Array(1), new Uint8Array(16), 1000, 32)).rejects.toThrow('native');
    });
  });
});
