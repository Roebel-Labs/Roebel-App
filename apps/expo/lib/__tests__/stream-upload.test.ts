import { supabase } from '../supabase';
import {
  probeStreamConfigured,
  STREAM_CHUNK_SIZE,
  _resetProbeCacheForTests,
} from '../stream-upload';

jest.mock('../supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const invokeMock = supabase.functions.invoke as jest.Mock;

describe('STREAM_CHUNK_SIZE', () => {
  it('is divisible by 256 KiB and at least 5 MiB (Cloudflare tus requirements)', () => {
    expect(STREAM_CHUNK_SIZE % (256 * 1024)).toBe(0);
    expect(STREAM_CHUNK_SIZE).toBeGreaterThanOrEqual(5 * 1024 * 1024);
  });
});

describe('probeStreamConfigured', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    _resetProbeCacheForTests();
  });

  it('returns true when the edge function reports configured', async () => {
    invokeMock.mockResolvedValue({ data: { configured: true }, error: null });
    await expect(probeStreamConfigured()).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('video-upload-url', {
      body: { action: 'probe' },
    });
  });

  it('caches the result (one invoke for two calls)', async () => {
    invokeMock.mockResolvedValue({ data: { configured: true }, error: null });
    await probeStreamConfigured();
    await probeStreamConfigured();
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('returns false when the edge function errors', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(probeStreamConfigured()).resolves.toBe(false);
  });

  it('returns false when invoke throws', async () => {
    invokeMock.mockRejectedValue(new Error('network'));
    await expect(probeStreamConfigured()).resolves.toBe(false);
  });
});
