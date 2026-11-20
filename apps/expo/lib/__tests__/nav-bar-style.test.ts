jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NAV_BAR_STYLE_KEY,
  __resetNavBarStyleForTests,
  getNavBarStyle,
  loadNavBarStyle,
  parseNavBarStyle,
  setNavBarStyle,
} from '../nav-bar-style';

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetNavBarStyleForTests();
});

describe('nav bar style preference', () => {
  it('parses unknown values to standard', () => {
    expect(parseNavBarStyle('glass')).toBe('glass');
    expect(parseNavBarStyle('standard')).toBe('standard');
    expect(parseNavBarStyle(null)).toBe('standard');
    expect(parseNavBarStyle('liquid')).toBe('standard');
  });

  it('defaults to standard when nothing is stored', async () => {
    expect(await loadNavBarStyle()).toBe('standard');
  });

  it('hydrates the stored value', async () => {
    await AsyncStorage.setItem(NAV_BAR_STYLE_KEY, 'glass');
    expect(await loadNavBarStyle()).toBe('glass');
    expect(getNavBarStyle()).toBe('glass');
  });

  it('applies immediately and persists', async () => {
    const p = setNavBarStyle('glass');
    expect(getNavBarStyle()).toBe('glass');
    await p;
    expect(await AsyncStorage.getItem(NAV_BAR_STYLE_KEY)).toBe('glass');
    __resetNavBarStyleForTests();
    expect(await loadNavBarStyle()).toBe('glass');
  });
});
