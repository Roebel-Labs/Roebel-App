import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyWalletMethod,
  WALLET_READ_METHODS,
  WALLET_SIGN_METHODS,
} from '../src/host/wallet-methods';

test('every signing method needs a confirmation', () => {
  for (const m of [
    'eth_sendTransaction',
    'personal_sign',
    'eth_sign',
    'eth_signTypedData',
    'eth_signTypedData_v3',
    'eth_signTypedData_v4',
  ])
    assert.equal(classifyWalletMethod(m), 'sign');
});

test('unknown methods are unsupported, never read', () => {
  assert.equal(classifyWalletMethod('wallet_grantPermissions'), 'unsupported');
  assert.equal(classifyWalletMethod('eth_signTransaction'), 'unsupported');
  assert.equal(classifyWalletMethod(''), 'unsupported');
});

test('account and chain queries are reads', () => {
  assert.equal(classifyWalletMethod('eth_accounts'), 'read');
  assert.equal(classifyWalletMethod('eth_chainId'), 'read');
  for (const m of WALLET_READ_METHODS) assert.equal(classifyWalletMethod(m), 'read');
});

test('the read and sign lists do not overlap', () => {
  for (const m of WALLET_SIGN_METHODS) assert.ok(!WALLET_READ_METHODS.includes(m), m);
});

test('matching is exact (case and prefix)', () => {
  assert.equal(classifyWalletMethod('ETH_SIGN'), 'unsupported');
  assert.equal(classifyWalletMethod('eth_sign '), 'unsupported');
  assert.equal(classifyWalletMethod('eth_signTypedData_v5'), 'unsupported');
});
