import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, mock } from 'node:test';
import { ClientBridge } from '../src/bridge';
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

test('handshake settles host mode when hello is answered', async () => {
  const bridge = new ClientBridge();
  const done = bridge.handshake('0.3.1');
  const hello = JSON.parse(fake.posted[0]) as { id: string; method: string };
  assert.equal(hello.method, 'bridge.hello');
  fake.deliver({ netizen: 1, id: hello.id, result: { ok: true } });
  await done;
  assert.equal(bridge.getMode(), 'host');
});

test('handshake falls back to mock after 2000 ms with no answer', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const bridge = new ClientBridge();
  const done = bridge.handshake('0.3.1');
  mock.timers.tick(1999);
  assert.equal(bridge.getMode(), 'unknown');
  mock.timers.tick(1);
  await done;
  assert.equal(bridge.getMode(), 'mock');
});

test('hello is re-sent until answered', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const bridge = new ClientBridge();
  void bridge.handshake('0.3.1');
  assert.equal(fake.posted.length, 1);
  mock.timers.tick(400);
  assert.equal(fake.posted.length, 2);
  mock.timers.tick(2000); // settles mock, retry stops
});

test('a response for an unknown id is ignored', async () => {
  const bridge = new ClientBridge();
  const done = bridge.handshake('0.3.1');
  fake.deliver({ netizen: 1, id: 'not-a-real-id', result: { ok: true } });
  assert.equal(bridge.getMode(), 'unknown');
  const hello = JSON.parse(fake.posted[0]) as { id: string };
  fake.deliver({ netizen: 1, id: hello.id, result: { ok: true } });
  await done;
  assert.equal(bridge.getMode(), 'host');
});

test('events reach on() subscribers and unsubscribe stops them', () => {
  const bridge = new ClientBridge();
  const seen: unknown[] = [];
  const off = bridge.on('walletChanged', (d) => seen.push(d));
  fake.deliver({ netizen: 1, event: 'walletChanged', data: 1 });
  off();
  fake.deliver({ netizen: 1, event: 'walletChanged', data: 2 });
  assert.deepEqual(seen, [1]);
});

test('a host that is reached over ReactNativeWebView receives a string', async () => {
  fake.restore();
  fake = installFakeWindow({ reactNative: true });
  const bridge = new ClientBridge();
  const done = bridge.handshake('0.3.1');
  const hello = JSON.parse(fake.posted[0]) as { id: string };
  fake.deliver(JSON.stringify({ netizen: 1, id: hello.id, result: { ok: true } }));
  await done;
  assert.equal(bridge.getMode(), 'host');
});
