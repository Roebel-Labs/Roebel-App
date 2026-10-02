jest.mock('../supabase', () => ({ supabase: {} }));
import { endMs, isDecryptDue } from '../vorhaben-decrypt';

// Proposal #3: voting ends 2026-10-04 16:03:35 CEST.
const END_S = 1791122615;
const END_MS = END_S * 1000;

describe('isDecryptDue', () => {
  it('is false while voting is still running', () => {
    expect(isDecryptDue(END_S, END_MS - 1)).toBe(false);
    expect(isDecryptDue(String(END_S), END_MS - 60_000)).toBe(false);
    expect(isDecryptDue(END_S, Date.UTC(2026, 9, 2))).toBe(false);
  });

  it('is true from the moment voting has ended', () => {
    expect(isDecryptDue(END_S, END_MS)).toBe(true);
    expect(isDecryptDue(String(END_S), END_MS + 3_600_000)).toBe(true);
  });

  it('is false 30 days after the end', () => {
    expect(isDecryptDue(END_S, END_MS + 30 * 86_400_000)).toBe(false);
  });

  it('never fires for a missing or non-timestamp deadline', () => {
    expect(isDecryptDue(null, END_MS)).toBe(false);
    expect(isDecryptDue(undefined, END_MS)).toBe(false);
    expect(isDecryptDue(0, END_MS)).toBe(false);
    expect(isDecryptDue('abc', END_MS)).toBe(false);
    expect(isDecryptDue(47070186, END_MS)).toBe(false); // a block number, not a time
    expect(endMs(47070186)).toBeNull();
  });
});
