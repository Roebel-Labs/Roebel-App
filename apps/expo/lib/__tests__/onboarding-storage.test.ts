jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockSecure = new Map<string, string>();
jest.mock('@/lib/storage/secureStorage', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecure.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecure.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecure.delete(key);
  }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveCitizenDraft,
  loadCitizenDraft,
  clearCitizenDraft,
  CITIZEN_DRAFT_KEY,
  LEGACY_CITIZEN_DRAFT_KEY,
  CITIZEN_DRAFT_MAX_AGE_MS,
} from '../onboarding-storage';

const DRAFT = {
  firstName: 'Anna',
  lastName: 'Müller',
  birthdate: '1990-01-01',
  address: 'Musterstraße 1, 17207 Röbel',
};

beforeEach(async () => {
  mockSecure.clear();
  await AsyncStorage.clear();
  jest.useRealTimers();
});

describe('citizen draft storage', () => {
  it('round-trips a draft', async () => {
    await saveCitizenDraft(DRAFT);
    expect(await loadCitizenDraft()).toEqual(DRAFT);
  });

  it('keeps the draft in secure storage, never in plain AsyncStorage', async () => {
    await saveCitizenDraft(DRAFT);
    expect(mockSecure.has(CITIZEN_DRAFT_KEY)).toBe(true);
    expect(await AsyncStorage.getItem(LEGACY_CITIZEN_DRAFT_KEY)).toBeNull();
  });

  it('clears the draft', async () => {
    await saveCitizenDraft(DRAFT);
    await clearCitizenDraft();
    expect(await loadCitizenDraft()).toBeNull();
  });

  it('returns null when nothing stored', async () => {
    expect(await loadCitizenDraft()).toBeNull();
  });

  it('expires and deletes a draft older than the max age', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await saveCitizenDraft(DRAFT);
    jest.setSystemTime(new Date(Date.parse('2026-01-01T00:00:00Z') + CITIZEN_DRAFT_MAX_AGE_MS + 1));
    expect(await loadCitizenDraft()).toBeNull();
    expect(mockSecure.has(CITIZEN_DRAFT_KEY)).toBe(false);
  });

  it('moves a legacy plain-text draft into secure storage once', async () => {
    await AsyncStorage.setItem(LEGACY_CITIZEN_DRAFT_KEY, JSON.stringify(DRAFT));
    expect(await loadCitizenDraft()).toEqual(DRAFT);
    expect(await AsyncStorage.getItem(LEGACY_CITIZEN_DRAFT_KEY)).toBeNull();
    expect(mockSecure.has(CITIZEN_DRAFT_KEY)).toBe(true);
  });

  it('clearing also removes a legacy plain-text draft', async () => {
    await AsyncStorage.setItem(LEGACY_CITIZEN_DRAFT_KEY, JSON.stringify(DRAFT));
    await clearCitizenDraft();
    expect(await AsyncStorage.getItem(LEGACY_CITIZEN_DRAFT_KEY)).toBeNull();
  });
});
