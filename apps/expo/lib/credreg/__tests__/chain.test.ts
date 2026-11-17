jest.mock('@/constants/gnosis', () => ({ credentialRegistryGnosisAddress: '0x' + '22'.repeat(20), credentialRegistryDeployBlock: 0 }));

import { fetchTypeMetadata, METADATA_TIMEOUT_MS, registryReader, REGISTRY } from '../chain';

describe('credreg chain', () => {
  afterEach(() => {
    jest.useRealTimers();
    delete (global as any).fetch;
  });

  it('builds one reader over the app-configured registry', () => {
    expect(REGISTRY).toBe('0x' + '22'.repeat(20));
    const r = registryReader();
    expect(typeof r.holdsMany).toBe('function');
    expect(registryReader()).toBe(r);
  });

  it('parses the metadata document', async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ name: 'Bürgerausweis', description: 'd', image: null, properties: { kind: 'membership', organisation: null, recognised: true, benefits: ['a', 1] } }),
    }));
    expect(await fetchTypeMetadata('https://www.roebel.app/api/credentials/types/0x1')).toEqual({
      name: 'Bürgerausweis',
      description: 'd',
      image: null,
      properties: { kind: 'membership', organisation: null, recognised: true, benefits: ['a'] },
    });
  });

  it('gives up after 10 s and on a malformed answer', async () => {
    jest.useFakeTimers();
    (global as any).fetch = jest.fn(
      (_u: string, init: { signal: AbortSignal }) =>
        new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))),
    );
    const pending = fetchTypeMetadata('https://x.example/m.json');
    jest.advanceTimersByTime(METADATA_TIMEOUT_MS);
    expect(await pending).toBeNull();
    jest.useRealTimers();
    (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ description: 'no name' }) }));
    expect(await fetchTypeMetadata('https://x.example/m.json')).toBeNull();
    expect(await fetchTypeMetadata('file:///etc/passwd')).toBeNull();
  });
});
