import { splitSelection, filterSuggestions } from '../follow-selection';

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
