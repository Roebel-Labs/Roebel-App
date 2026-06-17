// The module under test imports the real supabase client (which transitively
// loads expo-constants / native modules jest can't initialize). The function
// under test is pure, so stub the client to keep this a unit test.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { upsertMemberPatch } from '../supabase-roebeltaler';

test('upsertMemberPatch builds a patch with updated_at and required keys', () => {
  const patch = upsertMemberPatch('0xUser', { gnosis_address: '0xGnosis', circles_status: 'invited' });
  expect(patch.wallet_address).toBe('0xUser');
  expect(patch.gnosis_address).toBe('0xGnosis');
  expect(patch.circles_status).toBe('invited');
  expect(typeof patch.updated_at).toBe('string');
});
