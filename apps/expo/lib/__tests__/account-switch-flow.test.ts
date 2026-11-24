import {
  decideSwitchStart,
  pillAvatarAccount,
  createSwitchRunner,
  MIN_VISIBLE_MS,
} from '../account-switch-flow';
import type { Account } from '../types';

const acc = (id: string, type: 'personal' | 'organisation' = 'organisation') =>
  ({ id, account_type: type, name: id }) as unknown as Account;
const personal = acc('me', 'personal');
const orgA = acc('a');
const orgB = acc('b');

describe('decideSwitchStart', () => {
  it('switches straight to the one org from the personal account', () => {
    expect(decideSwitchStart({ activeId: 'me', accounts: [personal, orgA] })).toEqual({ kind: 'direct', targetId: 'a' });
  });
  it('switches straight back to personal from the one org', () => {
    expect(decideSwitchStart({ activeId: 'a', accounts: [personal, orgA] })).toEqual({ kind: 'direct', targetId: 'me' });
  });
  it('opens the picker when there are two or more other accounts', () => {
    expect(decideSwitchStart({ activeId: 'me', accounts: [personal, orgA, orgB] })).toEqual({ kind: 'sheet' });
  });
  it('does nothing with a single account', () => {
    expect(decideSwitchStart({ activeId: 'me', accounts: [personal] })).toEqual({ kind: 'none' });
  });
});

describe('pillAvatarAccount', () => {
  it('shows the account you would switch to when there is only one', () => {
    expect(pillAvatarAccount('me', [personal, orgA])?.id).toBe('a');
  });
  it('shows the current account when there are several others', () => {
    expect(pillAvatarAccount('me', [personal, orgA, orgB])?.id).toBe('me');
  });
});

describe('createSwitchRunner', () => {
  function setup(switchImpl: () => Promise<void>) {
    let t = 0;
    const sleeps: number[] = [];
    const deps = {
      switchAccount: jest.fn(async (_id: string) => {
        await switchImpl();
        t += 10;
      }),
      now: () => t,
      sleep: jest.fn(async (ms: number) => {
        sleeps.push(ms);
      }),
      onStart: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn(),
    };
    return { runner: createSwitchRunner(deps), deps, sleeps };
  }

  it('keeps the overlay up for at least the minimum time when the switch is fast', async () => {
    const { runner, deps, sleeps } = setup(async () => {});
    await runner.run('a');
    expect(MIN_VISIBLE_MS).toBe(900);
    expect(sleeps).toEqual([890]);
    expect(deps.onDone).toHaveBeenCalledWith('a');
    expect(runner.isRunning()).toBe(false);
  });

  it('ignores a second tap while a switch is running', async () => {
    let release!: () => void;
    const { runner, deps } = setup(() => new Promise<void>((r) => (release = r)));
    const first = runner.run('a');
    const second = runner.run('b');
    release();
    await Promise.all([first, second]);
    expect(deps.switchAccount).toHaveBeenCalledTimes(1);
    expect(deps.onStart).toHaveBeenCalledTimes(1);
  });

  it('reports a failed switch once and is ready again', async () => {
    const { runner, deps } = setup(async () => {
      throw new Error('offline');
    });
    await runner.run('a');
    expect(deps.onError).toHaveBeenCalledTimes(1);
    expect(deps.onDone).not.toHaveBeenCalled();
    expect(runner.isRunning()).toBe(false);
  });
});
