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
  it('parses unknown values to glass (the default)', () => {
    expect(parseNavBarStyle('glass')).toBe('glass');
    expect(parseNavBarStyle('standard')).toBe('standard');
    expect(parseNavBarStyle(null)).toBe('glass');
    expect(parseNavBarStyle('liquid')).toBe('glass');
  });

  it('defaults to glass when nothing is stored', async () => {
    expect(await loadNavBarStyle()).toBe('glass');
  });

  it('hydrates the stored value', async () => {
    await AsyncStorage.setItem(NAV_BAR_STYLE_KEY, 'standard');
    expect(await loadNavBarStyle()).toBe('standard');
    expect(getNavBarStyle()).toBe('standard');
  });

  it('applies immediately and persists', async () => {
    const p = setNavBarStyle('standard');
    expect(getNavBarStyle()).toBe('standard');
    await p;
    expect(await AsyncStorage.getItem(NAV_BAR_STYLE_KEY)).toBe('standard');
    __resetNavBarStyleForTests();
    expect(await loadNavBarStyle()).toBe('standard');
  });
});
