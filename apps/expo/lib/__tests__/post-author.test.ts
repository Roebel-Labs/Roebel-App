import { isWalletLike, resolvePostAuthor } from '../post-author';

const base = { account_id: null, wallet_address: '0xAB', author: undefined } as any;

describe('resolvePostAuthor', () => {
  it('legacy post without account: personal, wallet kept, name falls back to username', () => {
    const r = resolvePostAuthor({ ...base, author: { username: 'anna' } });
    expect(r).toEqual({ accountId: null, wallet: '0xab', name: 'anna', isPersonal: true });
  });
  it('personal account: wallet muted too, named by the person, not accounts.name', () => {
    const r = resolvePostAuthor({ ...base, account_id: 'a1', author: { username: 'u', account: { id: 'a1', account_type: 'personal', name: 'Anna' } } });
    expect(r).toEqual({ accountId: 'a1', wallet: '0xab', name: 'u', isPersonal: true });
  });
  it('personal account: display name wins over username', () => {
    const r = resolvePostAuthor({ ...base, account_id: 'a1', author: { username: 'u', display_name: 'Anna B.', account: { id: 'a1', account_type: 'personal', name: 'x' } } });
    expect(r.name).toBe('Anna B.');
  });
  it('org account: no wallet, named by accounts.name', () => {
    const r = resolvePostAuthor({ ...base, account_id: 'o1', author: { username: 'u', account: { id: 'o1', account_type: 'organisation', name: 'Verein' } } });
    expect(r.wallet).toBeNull();
    expect(r.isPersonal).toBe(false);
    expect(r.name).toBe('Verein');
  });
  it('wallet-shaped personal accounts.name is never the name', () => {
    const r = resolvePostAuthor({ ...base, account_id: 'a1', author: { username: '0x12ab', account: { id: 'a1', account_type: 'personal', name: '0x12…ab' } } });
    expect(r.name).toBe('Konto');
    const r2 = resolvePostAuthor({ ...base, account_id: 'a1', author: { username: 'anna', account: { id: 'a1', account_type: 'personal', name: '0x1234567890abcdef1234567890abcdef12345678' } } });
    expect(r2.name).toBe('anna');
  });
  it('never uses a wallet as name', () => {
    expect(resolvePostAuthor(base).name).toBe('Konto');
  });
});

describe('isWalletLike', () => {
  it('detects truncated and full wallets', () => {
    expect(isWalletLike('0x12…ab')).toBe(true);
    expect(isWalletLike(' 0xAbC ')).toBe(true);
    expect(isWalletLike('Anna')).toBe(false);
    expect(isWalletLike(null)).toBe(false);
  });
});
