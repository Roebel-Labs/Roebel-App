import { resolvePostAuthor } from '../post-author';

const base = { account_id: null, wallet_address: '0xAB', author: undefined } as any;

describe('resolvePostAuthor', () => {
  it('legacy post without account: personal, wallet kept, name falls back to username', () => {
    const r = resolvePostAuthor({ ...base, author: { username: 'anna' } });
    expect(r).toEqual({ accountId: null, wallet: '0xab', name: 'anna', isPersonal: true });
  });
  it('personal account: wallet muted too', () => {
    const r = resolvePostAuthor({ ...base, account_id: 'a1', author: { username: 'u', account: { id: 'a1', account_type: 'personal', name: 'Anna' } } });
    expect(r).toEqual({ accountId: 'a1', wallet: '0xab', name: 'Anna', isPersonal: true });
  });
  it('org account: no wallet', () => {
    const r = resolvePostAuthor({ ...base, account_id: 'o1', author: { username: 'u', account: { id: 'o1', account_type: 'organization', name: 'Verein' } } });
    expect(r.wallet).toBeNull();
    expect(r.isPersonal).toBe(false);
  });
  it('never uses a wallet as name', () => {
    expect(resolvePostAuthor(base).name).toBe('Konto');
  });
});
