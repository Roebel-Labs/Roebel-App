import { createSerialRunner } from '../serial-runner';

describe('createSerialRunner', () => {
  it('runs tasks in order, never overlapping', async () => {
    const enqueue = createSerialRunner();
    const log: string[] = [];
    const slow = enqueue(async () => { log.push('a-start'); await new Promise((r) => setTimeout(r, 20)); log.push('a-end'); return 1; });
    const fast = enqueue(async () => { log.push('b'); return 2; });
    expect(await Promise.all([slow, fast])).toEqual([1, 2]);
    expect(log).toEqual(['a-start', 'a-end', 'b']);
  });
  it('keeps going after a task rejects', async () => {
    const enqueue = createSerialRunner();
    const bad = enqueue(async () => { throw new Error('x'); });
    const good = enqueue(async () => 'ok');
    await expect(bad).rejects.toThrow('x');
    await expect(good).resolves.toBe('ok');
  });
});
