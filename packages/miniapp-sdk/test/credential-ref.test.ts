import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUILTIN_CREDENTIALS,
  credentialMatches,
  isCredentialRef,
  parseCredentialRef,
} from '../src/credential-ref';
import * as client from '../src/index';
import * as host from '../src/host';

const T = 'type:0x' + '11'.repeat(32);
const ORG = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';

test('built-ins, types and orgs parse', () => {
  assert.deepEqual(parseCredentialRef('citizen'), { kind: 'builtin', name: 'citizen' });
  assert.deepEqual(parseCredentialRef(T), { kind: 'type', typeId: '0x' + '11'.repeat(32) });
  assert.deepEqual(parseCredentialRef('org:' + ORG.toUpperCase()), { kind: 'org', org: ORG });
});

test('type hex is lowercased on output', () => {
  assert.deepEqual(parseCredentialRef('type:0x' + 'AB'.repeat(32)), {
    kind: 'type',
    typeId: '0x' + 'ab'.repeat(32),
  });
});

test('everything else is not a ref', () => {
  for (const s of [
    '',
    'Citizen',
    'type:0x11',
    'type:' + '11'.repeat(32),
    'org:12',
    'org:' + ORG + ':member',
    'org:*',
    'user:1',
  ]) {
    assert.equal(isCredentialRef(s), false, s);
    assert.equal(parseCredentialRef(s), null, s);
  }
  for (const v of [null, undefined, 1, {}, ['citizen']]) assert.equal(isCredentialRef(v), false);
  for (const s of [...BUILTIN_CREDENTIALS, T, 'org:' + ORG]) assert.equal(isCredentialRef(s), true, s);
});

test('an org pattern matches the held types of that org only', () => {
  assert.equal(credentialMatches('org:' + ORG, { type: T, org: ORG }), true);
  assert.equal(credentialMatches('org:' + ORG, { type: T, org: OTHER }), false);
  assert.equal(credentialMatches('org:' + ORG, { type: 'citizen' }), false);
  assert.equal(credentialMatches(T, { type: T, org: ORG }), true);
  assert.equal(credentialMatches('citizen', { type: 'citizen' }), true);
  assert.equal(credentialMatches('citizen', { type: 'attester' }), false);
  assert.equal(credentialMatches('nonsense', { type: 'nonsense' }), false);
});

test('exported from both entry points', () => {
  assert.equal(client.credentialMatches, credentialMatches);
  assert.equal(host.parseCredentialRef, parseCredentialRef);
});
