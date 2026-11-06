import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createOta, signedText, OTA_RUNTIME, BOOT_TIMEOUT_MS } = require('../ota.cjs');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const tmp: string[] = [];
afterEach(() => {
  tmp.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  vi.useRealTimers();
});

const BUNDLE = Buffer.from('fake-asar-bytes');
const sha = crypto.createHash('sha256').update(BUNDLE).digest('hex');
const url = (v: string) => `https://github.com/Roebel-Labs/Roebel-App/releases/download/ortis-studio-ota-v${v}/renderer-${v}.asar`;
function manifest(v: string, extra: Record<string, unknown> = {}) {
  const o = { version: v, runtime: OTA_RUNTIME, url: url(v), sha256: sha, ...extra };
  return { ...o, signature: crypto.sign(null, Buffer.from(signedText(o)), privateKey).toString('base64') };
}
function setup(latest: unknown, body = BUNDLE) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ortis-ota-'));
  tmp.push(userDataDir);
  const fetchImpl = vi.fn(async (u: string) =>
    u.endsWith('latest.json')
      ? { ok: true, json: async () => latest }
      : { ok: true, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) },
  );
  // Real asar contents cannot be read in plain Node: the bundle file standing in for it is enough.
  const make = () =>
    createOta({ userDataDir, appVersion: '0.1.3', bundledDist: '/app/dist', fsImpl: fs, readable: () => true, fetchImpl, publicKey: PUB });
  return { make, fetchImpl, userDataDir };
}

describe('OTA interface updates', () => {
  it('downloads a signed newer bundle, waits for the restart, then serves it; the show folder is untouched', async () => {
    const { make } = setup({ ota: manifest('0.1.4') });
    const ota = make();
    expect(ota.indexFile()).toBe(path.join('/app/dist', 'index.html'));
    expect(await ota.check('https://www.roebel.app/studio/latest.json')).toBe('0.1.4');
    expect(ota.version()).toBe('0.1.3'); // nothing changes until "Neu starten"
    expect(ota.apply()).toMatch(/renderer-0\.1\.4\.asar[\\/]index\.html$/);
    expect(ota.version()).toBe('0.1.4');
    // A fresh start (app relaunch) keeps the applied bundle.
    expect(make().version()).toBe('0.1.4');
  });

  it('rejects a bad signature, another runtime, a foreign URL and a tampered file', async () => {
    const bad = { ...manifest('0.1.4'), signature: Buffer.from('nope').toString('base64') };
    expect(await setup({ ota: bad }).make().check('x/latest.json')).toBeNull();
    expect(await setup({ ota: manifest('0.1.4', { runtime: OTA_RUNTIME + 1 }) }).make().check('x/latest.json')).toBeNull();
    expect(await setup({ ota: manifest('0.1.4', { url: 'https://evil.test/renderer-0.1.4.asar' }) }).make().check('x/latest.json')).toBeNull();
    await expect(setup({ ota: manifest('0.1.4') }, Buffer.from('tampered')).make().check('x/latest.json')).rejects.toThrow(/Prüfsumme/);
    expect(await setup({ ota: manifest('0.1.3') }).make().check('x/latest.json')).toBeNull(); // not newer
  });

  it('rolls back to the built-in interface when a bundle never reports ready, and never retries it', async () => {
    vi.useFakeTimers();
    const { make } = setup({ ota: manifest('0.1.4') });
    const ota = make();
    await ota.check('x/latest.json');
    ota.apply();
    const failed = vi.fn();
    ota.beginBoot(failed);
    vi.advanceTimersByTime(BOOT_TIMEOUT_MS + 1);
    expect(failed).toHaveBeenCalledOnce();
    expect(ota.version()).toBe('0.1.3');
    expect(await make().check('x/latest.json')).toBeNull(); // marked bad
  });

  it('keeps a bundle that reported ready', async () => {
    vi.useFakeTimers();
    const { make } = setup({ ota: manifest('0.1.4') });
    const ota = make();
    await ota.check('x/latest.json');
    ota.apply();
    const failed = vi.fn();
    ota.beginBoot(failed);
    ota.ready();
    vi.advanceTimersByTime(BOOT_TIMEOUT_MS + 1);
    expect(failed).not.toHaveBeenCalled();
    expect(ota.version()).toBe('0.1.4');
  });
});
