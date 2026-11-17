import {
  confirmMatches,
  deriveWordAddresses,
  entropyToPhrase,
  generatePhrase,
  normalizePhrase,
  phraseErrorMessage,
  pickConfirmPositions,
  validatePhrase,
  wordAccount,
  wordsFromSeed,
  wordsVaultKey,
  WORDS_POOL_SIZE,
} from '../words';
import vector from './words-vector.json';

const hex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'));
const LEGAL = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const JUNK = 'test test test test test test test test test test test junk';

describe('recovery words primitives', () => {
  it('encodes the BIP-39 reference vectors', () => {
    expect(entropyToPhrase(hex('00'.repeat(16)))).toBe(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    );
    expect(entropyToPhrase(hex('7f'.repeat(16)))).toBe(LEGAL);
    expect(entropyToPhrase(hex('ff'.repeat(16)))).toBe('zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong');
  });

  it('validates: count, unknown word, checksum, and forgives case and spacing', () => {
    expect(
      validatePhrase('  Legal winner  thank year wave sausage worth useful legal winner thank YELLOW '),
    ).toEqual({ ok: true, phrase: LEGAL });
    expect(validatePhrase('abandon abandon')).toMatchObject({ ok: false, reason: 'count' });
    expect(validatePhrase('')).toMatchObject({ ok: false, reason: 'count' });
    expect(validatePhrase('abandon '.repeat(11) + 'abuot')).toEqual({
      ok: false,
      reason: 'word',
      badWords: ['abuot'],
    });
    expect(validatePhrase('abandon '.repeat(12))).toMatchObject({ ok: false, reason: 'checksum' });
  });

  it('a one-word typo is reported before anything else (which word, or checksum)', () => {
    // Misspelled word: the person is told which one.
    const typo = LEGAL.replace('sausage', 'sausge');
    const r = validatePhrase(typo);
    expect(r).toEqual({ ok: false, reason: 'word', badWords: ['sausge'] });
    if (!r.ok) expect(phraseErrorMessage(r)).toBe('Dieses Wort kennen wir nicht: sausge');
    // A real but wrong word: checksum fails.
    const r2 = validatePhrase(LEGAL.replace('winner', 'wine'));
    expect(r2).toMatchObject({ ok: false, reason: 'checksum' });
    if (!r2.ok) expect(phraseErrorMessage(r2)).toBe('Die Wörter passen nicht zusammen. Prüfe die Reihenfolge und die Schreibweise.');
    expect(phraseErrorMessage({ reason: 'count', badWords: [] })).toBe('Es müssen genau 12 Wörter sein.');
  });

  it('normalizes NFKD, case and spacing', () => {
    expect(normalizePhrase('  A  b\n c ')).toBe('a b c');
    // Fullwidth letters only become plain ASCII through NFKD (a plain lowercase would keep them).
    expect(normalizePhrase('ａｂａｎｄｏｎ  ＡＢＯＵＴ')).toBe('abandon about');
  });

  it('derives the standard Ethereum addresses', () => {
    expect(deriveWordAddresses(JUNK, 3)).toEqual([
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    ]);
    expect(
      deriveWordAddresses(
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        1,
      ),
    ).toEqual(['0x9858EfFD232B4033E47d90003D41EC34EcaEda94']);
    expect(deriveWordAddresses(JUNK)).toHaveLength(WORDS_POOL_SIZE);
    expect(wordAccount(JUNK, 1).address).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  });

  it('wordsFromSeed yields the vector, addresses and accounts from one seed', () => {
    const kit = wordsFromSeed(vector.phrase);
    expect(kit.vaultKey()).toBe(vector.vaultKey);
    expect(kit.addresses()).toEqual(deriveWordAddresses(vector.phrase));
    expect(kit.addresses(3)[1]).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(kit.account(0).address).toBe(wordAccount(vector.phrase, 0).address);
  });

  it('generatePhrase yields a valid 12-word phrase from the injected entropy', () => {
    expect(generatePhrase(() => hex('7f'.repeat(16)))).toBe(LEGAL);
    expect(validatePhrase(generatePhrase()).ok).toBe(true);
  });

  it('vault key matches the independent vector and differs from every pool key', () => {
    expect(vector.phrase).toBe(JUNK);
    expect(wordsVaultKey(vector.phrase)).toBe(vector.vaultKey);
    for (let i = 0; i < WORDS_POOL_SIZE; i++) {
      const pk = wordAccount(vector.phrase, i).getHdKey().privateKey!;
      expect('0x' + Buffer.from(pk).toString('hex')).not.toBe(vector.vaultKey);
    }
  });

  it('confirm positions are three distinct ascending indexes and matching is exact per position', () => {
    const p = pickConfirmPositions(() => Uint8Array.from([3, 3, 250, 7, 11, 0]));
    expect(new Set(p).size).toBe(3);
    expect([...p].sort((a, b) => a - b)).toEqual(p);
    expect(confirmMatches(LEGAL, { 0: 'Legal ', 3: 'year', 11: 'yellow' })).toBe(true);
    expect(confirmMatches(LEGAL, { 0: 'legal', 3: 'wave', 11: 'yellow' })).toBe(false);
  });
});
