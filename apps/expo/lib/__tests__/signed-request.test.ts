jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, s: string) =>
    require('node:crypto').createHash('sha256').update(s).digest('hex'),
}));

import { buildSignedMessage, postSigned } from '../signed-request';

describe('signed-request', () => {
  it('builds the roebel-tickets-v1 message with sorted payload hash', async () => {
    const msg = await buildSignedMessage('checkout', '0xABC', 1700000000, { b: 2, a: 'x' });
    expect(msg).toMatch(/^roebel-tickets-v1:checkout:0xabc:1700000000:[0-9a-f]{64}$/);
    expect(msg).toBe(await buildSignedMessage('checkout', '0xabc', 1700000000, { a: 'x', b: 2 }));
  });

  it('posts the signed body and unwraps the envelope', async () => {
    const account = { address: '0xABC', signMessage: jest.fn(async () => '0x' + 'ab'.repeat(65)) };
    const fetchMock = jest.fn(async () => ({ json: async () => ({ ok: true, data: { hello: 1 } }) }));
    (global as any).fetch = fetchMock;
    const res = await postSigned<{ hello: number }>('/api/tickets/order', account, 'order_status', { order_id: 'o1' });
    expect(res).toEqual({ ok: true, data: { hello: 1 } });
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toMatch(/\/api\/tickets\/order$/);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ scope: 'roebel-tickets-v1', action: 'order_status', wallet: '0xabc', payload: { order_id: 'o1' } });
    expect(body.signature).toMatch(/^0x/);
  });
});
