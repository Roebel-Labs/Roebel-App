import { decideVoteTransition } from '../supabase-forum';

describe('decideVoteTransition', () => {
  it('inserts on first tap', () => {
    expect(decideVoteTransition(null, 1)).toEqual({ action: 'insert', value: 1 });
    expect(decideVoteTransition(null, -1)).toEqual({ action: 'insert', value: -1 });
  });
  it('removes when tapping the active arrow again', () => {
    expect(decideVoteTransition(1, 1)).toEqual({ action: 'delete' });
    expect(decideVoteTransition(-1, -1)).toEqual({ action: 'delete' });
  });
  it('flips when tapping the opposite arrow', () => {
    expect(decideVoteTransition(1, -1)).toEqual({ action: 'flip', value: -1 });
    expect(decideVoteTransition(-1, 1)).toEqual({ action: 'flip', value: 1 });
  });
});
