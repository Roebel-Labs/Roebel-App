import { describe, expect, it } from 'vitest';
import { commitValue } from '../table/edit';

describe('commitValue', () => {
  it('commits a changed draft', () => expect(commitValue('b', 'a', false)).toBe('b'));
  it('does not commit when cancelled (Escape)', () => expect(commitValue('b', 'a', true)).toBeNull());
  it('does not commit an unchanged draft', () => expect(commitValue('a', 'a', false)).toBeNull());
});
