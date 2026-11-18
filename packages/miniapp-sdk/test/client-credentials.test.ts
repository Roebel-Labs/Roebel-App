import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { createClient } from '../src/client';
import type { Credential } from '../src/types';
import { installFakeWindow, type FakeWindow } from './fake-window';

let fake: FakeWindow;
beforeEach(() => {
  mock.method(console, 'info', () => undefined); // silence the mock-mode banner
  fake = installFakeWindow();
});
afterEach(() => {
  fake.restore();
  mock.reset();
  mock.timers.reset();
});

function answerHello(result: unknown) {
  const hello = JSON.parse(fake.posted[0]) as { id: string; method: string };
  assert.equal(hello.method, 'bridge.hello');
  fake.deliver({ netizen: 1, id: hello.id, result });
}

test('supports() is true in mock mode', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const sdk = createClient();
  mock.timers.tick(2000);
  await sdk.isReady;
  assert.equal(sdk.isMockMode(), true);
  assert.equal(sdk.supports('credentials.list'), true);
  assert.equal(sdk.supports('roebel.pay'), true);
});

test('supports() follows the host list', async () => {
  const sdk = createClient();
  answerHello({ ok: true, methods: ['context.get'] });
  await sdk.isReady;
  assert.equal(sdk.supports('context.get'), true);
  assert.equal(sdk.supports('credentials.list'), false);
});

test('supports() is true when an old host sends no list', async () => {
  const sdk = createClient();
  answerHello({ ok: true });
  await sdk.isReady;
  assert.equal(sdk.supports('credentials.list'), true);
});

test('credentials.has sends the type to the host', async () => {
  const sdk = createClient();
  answerHello({ ok: true, methods: ['credentials.has'] });
  await sdk.isReady;
  const p = sdk.credentials.has('citizen');
  await new Promise((r) => setTimeout(r, 0));
  const sent = JSON.parse(fake.posted[fake.posted.length - 1]) as { id: string; method: string; params: unknown };
  assert.equal(sent.method, 'credentials.has');
  assert.deepEqual(sent.params, { type: 'citizen' });
  fake.deliver({ netizen: 1, id: sent.id, result: true });
  assert.equal(await p, true);
});

test('onChange delivers the new list and unsubscribes', async () => {
  const sdk = createClient();
  answerHello({ ok: true });
  await sdk.isReady;
  const seen: Credential[][] = [];
  const list: Credential[] = [{ type: 'citizen', kind: 'builtin', name: 'Bürger:in', recognised: true }];
  const off = sdk.credentials.onChange((l) => seen.push(l));
  fake.deliver({ netizen: 1, event: 'credentialsChanged', data: list });
  off();
  fake.deliver({ netizen: 1, event: 'credentialsChanged', data: [] });
  assert.deepEqual(seen, [list]);
});
