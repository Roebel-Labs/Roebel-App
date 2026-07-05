jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { saveCitizenDraft, loadCitizenDraft, clearCitizenDraft } from '../onboarding-storage';

const DRAFT = {
  firstName: 'Anna',
  lastName: 'Müller',
  birthdate: '1990-01-01',
  address: 'Musterstraße 1, 17207 Röbel',
};

describe('citizen draft storage', () => {
  it('round-trips a draft', async () => {
    await saveCitizenDraft(DRAFT);
    expect(await loadCitizenDraft()).toEqual(DRAFT);
  });

  it('clears the draft', async () => {
    await saveCitizenDraft(DRAFT);
    await clearCitizenDraft();
    expect(await loadCitizenDraft()).toBeNull();
  });

  it('returns null when nothing stored', async () => {
    await clearCitizenDraft();
    expect(await loadCitizenDraft()).toBeNull();
  });
});
