/**
 * The org's side of a mini-app binding: which buttons a status offers, and the signed requests
 * to list and decide (never throwing; null / [] on failure).
 */
const mockMem = new Map<string, string>();
jest.mock('@/lib/storage/secureStorage', () => ({
  getItemAsync: async (k: string) => mockMem.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockMem.set(k, v),
  deleteItemAsync: async (k: string) => void mockMem.delete(k),
}));
jest.mock('@/lib/passkey/constants', () => ({ PASSKEY_API_URL: 'https://passkey.test' }));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) =>
    jest.requireActual('node:crypto').createHash('sha256').update(s).digest('hex'),
}));
jest.mock('../miniapp-api', () => ({ miniAppApiBase: () => 'https://node.test' }));

// eslint-disable-next-line import/first
import { bindingActions, decideOrgBinding, listOrgBindings } from '../miniapp-org-binding';

const ORG = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const ADDR = '0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28';
const account = { address: ADDR, signMessage: jest.fn(async () => '0xsig') };

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
});

const respond = (status: number, json: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => json });

it('a request can be confirmed or rejected', () => expect(bindingActions('requested')).toEqual(['confirm', 'reject']));
it('a confirmed binding can be removed', () => expect(bindingActions('confirmed')).toEqual(['remove']));
it('a rejected one can still be confirmed', () => expect(bindingActions('rejected')).toEqual(['confirm']));
it('nothing to decide without a binding', () => expect(bindingActions('none')).toEqual([]));

it('a failed request returns null and does not throw', async () => {
  respond(403, { ok: false, code: 'forbidden' });
  await expect(decideOrgBinding(account, 'app-1', 'confirm')).resolves.toBeNull();
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  await expect(listOrgBindings(account, ORG)).resolves.toBeNull();
});

it('lists the apps that name the org, dropping malformed rows', async () => {
  respond(200, {
    apps: [
      { id: 'a1', slug: 'psv', name: 'PSV', iconUrl: null, binding: 'requested' },
      { id: 'a2', slug: 'x', name: 'X', iconUrl: null, binding: 'weird' },
    ],
  });
  await expect(listOrgBindings(account, ORG)).resolves.toEqual([
    { id: 'a1', slug: 'psv', name: 'PSV', iconUrl: null, binding: 'requested' },
  ]);
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(fetchMock.mock.calls[0][0]).toBe('https://node.test/api/mini-apps/org-binding');
  expect(body).toMatchObject({ scope: 'roebel-miniapp-v1', action: 'org_binding_list', payload: { account: ORG } });
});

it('a decision returns the new binding', async () => {
  respond(200, { binding: 'confirmed' });
  await expect(decideOrgBinding(account, 'app-1', 'confirm')).resolves.toBe('confirmed');
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body).toMatchObject({ action: 'org_binding_decide', payload: { app: 'app-1', decision: 'confirm' } });
});
