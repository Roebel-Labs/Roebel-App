jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), dismissTo: jest.fn() } }));
import { router } from 'expo-router';
import { goToTab, onTabArrival, tabSwitchAction } from '../navigation/goToTab';

describe('tabSwitchAction', () => {
  it('does nothing when the section is already on screen', () => {
    expect(tabSwitchAction('home', '/')).toBe('none');
    expect(tabSwitchAction('explore', '/explore')).toBe('none');
    expect(tabSwitchAction('profile', '/profile')).toBe('none');
  });
  it('switches tabs between the kept-alive sections', () => {
    expect(tabSwitchAction('explore', '/')).toBe('switch');
    expect(tabSwitchAction('profile', '/')).toBe('switch');
    expect(tabSwitchAction('home', '/explore')).toBe('switch');
    expect(tabSwitchAction('profile', '/explore')).toBe('switch');
  });
  it('pops back to the tab group from any other screen', () => {
    expect(tabSwitchAction('explore', '/events')).toBe('dismissTo');
    expect(tabSwitchAction('home', '/governance')).toBe('dismissTo');
  });
});

describe('goToTab', () => {
  it('calls the router accordingly', () => {
    goToTab('explore', '/');
    expect(router.navigate).toHaveBeenCalledWith('/explore');
    goToTab('home', '/events');
    expect(router.dismissTo).toHaveBeenCalledWith('/');
  });

  it('tells the target section before navigating', () => {
    const seen: string[] = [];
    const off = onTabArrival((t) => seen.push(t));
    goToTab('home', '/explore');
    goToTab('home', '/');
    off();
    expect(seen).toEqual(['home']);
  });
});
