import { runWithRetry } from '../muenzen-settlement';

describe('runWithRetry', () => {
  test('calls settle once and never sleeps on first success', async () => {
    const settle = jest.fn().mockResolvedValue(undefined);
    const sleep = jest.fn().mockResolvedValue(undefined);
    await runWithRetry(settle, { sleep });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('retries with backoff then succeeds', async () => {
    const settle = jest
      .fn()
      .mockRejectedValueOnce(new Error('rpc'))
      .mockRejectedValueOnce(new Error('rpc'))
      .mockResolvedValue(undefined);
    const sleep = jest.fn().mockResolvedValue(undefined);
    await runWithRetry(settle, { attempts: 3, backoffMs: [3000, 9000], sleep });
    expect(settle).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([3000, 9000]);
  });

  test('throws the last error after exhausting attempts', async () => {
    const settle = jest.fn().mockRejectedValue(new Error('boom'));
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(runWithRetry(settle, { attempts: 3, sleep })).rejects.toThrow('boom');
    expect(settle).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
