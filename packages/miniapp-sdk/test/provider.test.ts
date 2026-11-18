import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClientBridge } from '../src/bridge';
import { createEip1193Provider, toProviderError } from '../src/provider';
import type { BridgeError } from '../src/types';

function fakeBridge(error: BridgeError): ClientBridge {
  return {
    on: () => () => undefined,
    request: () => Promise.reject(error),
  } as unknown as ClientBridge;
}

test('a user rejection becomes EIP-1193 code 4001 and keeps the bridge code', () => {
  const e = toProviderError({ code: 'user_rejected', message: 'x' });
  assert.equal(e.code, 4001);
  assert.equal(e.data.bridgeCode, 'user_rejected');
  assert.equal(e.message, 'x');
  assert.ok(e instanceof Error);
});

test('an unsupported chain keeps the host code 4902', () =>
  assert.equal(toProviderError({ code: 'unsupported', message: 'x', rpcCode: 4902 }).code, 4902));

test('unsupported without a host code is 4200', () =>
  assert.equal(toProviderError({ code: 'unsupported', message: 'x' }).code, 4200));

test('the remaining codes map to their EIP-1193 / JSON-RPC numbers', () => {
  assert.equal(toProviderError({ code: 'unauthorized', message: 'x' }).code, 4100);
  assert.equal(toProviderError({ code: 'invalid_params', message: 'x' }).code, -32602);
  assert.equal(toProviderError({ code: 'rate_limited', message: 'x' }).code, -32005);
  assert.equal(toProviderError({ code: 'timeout', message: 'x' }).code, -32603);
  assert.equal(toProviderError({ code: 'internal', message: 'x' }).code, -32603);
  assert.equal(toProviderError({ code: 'budget_exceeded', message: 'x' }).code, -32603);
});

test('provider.request rejects with the mapped error', async () => {
  const p = createEip1193Provider(fakeBridge({ code: 'unauthorized', message: 'nope' }));
  await assert.rejects(p.request({ method: 'eth_accounts' }), (e: unknown) => {
    const x = e as Error & { code: number; data: { bridgeCode: string } };
    assert.ok(x instanceof Error);
    assert.equal(x.code, 4100);
    assert.equal(x.data.bridgeCode, 'unauthorized');
    return true;
  });
});
