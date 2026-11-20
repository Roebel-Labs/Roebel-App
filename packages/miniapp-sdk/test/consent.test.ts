import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consentKeys, pendingConsentKeys } from '../src/host';

const ORG = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const identity = {
  profile: true,
  address: false,
  credentials: [
    { type: 'citizen', reason: 'x' },
    { type: 'org:' + ORG, reason: 'y' },
  ],
};

test('keys follow the manifest order', () =>
  assert.deepEqual(consentKeys(identity), ['profile', 'cred:citizen', 'cred:org:' + ORG]));

test('address comes after profile when both are requested', () =>
  assert.deepEqual(consentKeys({ profile: true, address: true, credentials: [] }), ['profile', 'address']));

test('only what was never asked is pending', () =>
  assert.deepEqual(pendingConsentKeys(identity, ['profile', 'cred:citizen']), ['cred:org:' + ORG]));

test('no identity section, nothing to ask', () => {
  assert.deepEqual(consentKeys(undefined), []);
  assert.deepEqual(pendingConsentKeys(undefined, []), []);
});
