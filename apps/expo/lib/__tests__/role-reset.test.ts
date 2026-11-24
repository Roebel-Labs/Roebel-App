jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { roleAfterAccountChange } from '../role-cache';

describe('roleAfterAccountChange', () => {
  it("drops the previous account's role when the active account changes", () => {
    expect(roleAfterAccountChange('org-a', 'org-b', 'owner')).toBeNull();
  });
  it('keeps the role when only re-checking the same account', () => {
    expect(roleAfterAccountChange('org-a', 'org-a', 'admin')).toBe('admin');
  });
  it('starts empty on first load', () => {
    expect(roleAfterAccountChange(null, 'org-a', null)).toBeNull();
  });
});
