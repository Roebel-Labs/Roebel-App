import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callRules, findDeclaredCall } from '../src/host/declared-calls';

const A = '0xabc0000000000000000000000000000000000001';

test('findDeclaredCall matches address and selector, case-insensitively, and nothing else', () => {
  const rules = callRules(
    [{ address: '0xAbC0000000000000000000000000000000000001', label: 'Trainingsbuch', functions: ['checkIn(uint256)'] }],
    () => '0x12345678',
  );
  assert.deepEqual(findDeclaredCall(rules, A, '0x12345678ff'), {
    label: 'Trainingsbuch',
    signature: 'checkIn(uint256)',
    name: 'checkIn',
  });
  assert.deepEqual(findDeclaredCall(rules, A.toUpperCase().replace('0X', '0x'), '0x12345678'), {
    label: 'Trainingsbuch',
    signature: 'checkIn(uint256)',
    name: 'checkIn',
  });
  assert.equal(findDeclaredCall(rules, A, '0x87654321'), null);
  assert.equal(findDeclaredCall(rules, '0x0000000000000000000000000000000000000002', '0x12345678'), null);
  assert.equal(findDeclaredCall(rules, undefined, '0x12345678'), null);
  assert.equal(findDeclaredCall(rules, A, '0x'), null);
  assert.equal(findDeclaredCall(rules, A, undefined), null);
  assert.equal(findDeclaredCall(rules, A, '0x123456'), null);
});

test('callRules lowercases addresses and maps each selector to its signature', () => {
  const sel: Record<string, string> = { 'a()': '0xAAAAAAAA', 'b(uint256)': '0xbbbbbbbb' };
  const rules = callRules(
    [{ address: '0xAbC0000000000000000000000000000000000001', label: 'X', functions: ['a()', 'b(uint256)'] }],
    (s) => sel[s],
  );
  assert.equal(rules[0].address, A);
  assert.deepEqual(rules[0].selectors, { '0xaaaaaaaa': 'a()', '0xbbbbbbbb': 'b(uint256)' });
  assert.equal(findDeclaredCall(rules, A, '0xAAAAAAAA')?.name, 'a');
});
