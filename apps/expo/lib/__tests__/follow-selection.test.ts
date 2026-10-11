import { splitSelection, filterSuggestions, submitFollowSelection, orgsFirst, collapsedSuggestions } from '../follow-selection';

describe('follow-selection', () => {
  it('everything ticked by default; unticked become explicit unfollows', () => {
    expect(splitSelection(['a', 'b', 'c'], new Set(['b']))).toEqual({ follow: ['a', 'c'], unfollow: ['b'] });
  });
  it('an empty town still produces a valid, empty submission', () => {
    expect(splitSelection([], new Set())).toEqual({ follow: [], unfollow: [] });
  });
  it('search matches name case- and accent-insensitively', () => {
    const s = [{ account_id: '1', name: 'Fischerei Müritz' }, { account_id: '2', name: 'Angelverein' }];
    expect(filterSuggestions(s as any, 'muritz').map((x) => x.account_id)).toEqual(['1']);
    expect(filterSuggestions(s as any, '').length).toBe(2);
  });
});

describe('submitFollowSelection', () => {
  const ids = ['a', 'b', 'c'];
  it('returns true on success and unfollows only unticked ids', async () => {
    const follow = jest.fn().mockResolvedValue(true);
    const unfollow = jest.fn().mockResolvedValue(true);
    expect(await submitFollowSelection(ids, new Set(['b']), 'onboarding', follow, unfollow)).toBe(true);
    expect(follow).toHaveBeenCalledWith(['a', 'c'], 'onboarding');
    expect(unfollow).toHaveBeenCalledWith(['b']);
  });
  it('skips unfollow when nothing is unticked', async () => {
    const unfollow = jest.fn().mockResolvedValue(true);
    await submitFollowSelection(ids, new Set(), 'intro', jest.fn().mockResolvedValue(true), unfollow);
    expect(unfollow).not.toHaveBeenCalled();
  });
  it('returns false when follow resolves false', async () => {
    expect(await submitFollowSelection(ids, new Set(), 'intro', jest.fn().mockResolvedValue(false), jest.fn())).toBe(false);
  });
  it('never throws: a throwing follow yields false', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const follow = jest.fn().mockRejectedValue(new Error('boom'));
    expect(await submitFollowSelection(ids, new Set(), 'onboarding', follow, jest.fn())).toBe(false);
    spy.mockRestore();
  });
});

describe('orgsFirst', () => {
  it('puts organisations before people and keeps the ranking within each group', () => {
    const list = [
      { account_id: 'p1', account_type: 'personal' },
      { account_id: 'o1', account_type: 'organisation' },
      { account_id: 'p2', account_type: 'personal' },
      { account_id: 'o2', account_type: 'organisation' },
    ];
    expect(orgsFirst(list).map((s) => s.account_id)).toEqual(['o1', 'o2', 'p1', 'p2']);
  });
});

describe('collapsedSuggestions', () => {
  const org = (id: string) => ({ account_id: id, account_type: 'organisation' });
  const person = (id: string) => ({ account_id: id, account_type: 'personal' });
  it('shows the first n organisations only', () => {
    const list = [org('o1'), org('o2'), org('o3'), org('o4'), org('o5'), org('o6'), person('p1')];
    expect(collapsedSuggestions(list, 5).map((s) => s.account_id)).toEqual(['o1', 'o2', 'o3', 'o4', 'o5']);
  });
  it('tops up with people when there are fewer organisations', () => {
    const list = [org('o1'), person('p1'), person('p2')];
    expect(collapsedSuggestions(list, 2).map((s) => s.account_id)).toEqual(['o1', 'p1']);
  });
});
