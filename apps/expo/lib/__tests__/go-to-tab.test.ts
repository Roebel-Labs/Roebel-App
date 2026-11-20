jest.mock('expo-router', () => ({ router: { push: jest.fn(), dismissTo: jest.fn() } }));
import { router } from 'expo-router';
import { goToTab, tabSwitchAction } from '../navigation/goToTab';

describe('tabSwitchAction', () => {
  it('does nothing when the section is already on screen', () => {
    expect(tabSwitchAction('home', '/')).toBe('none');
    expect(tabSwitchAction('explore', '/explore')).toBe('none');
    expect(tabSwitchAction('profile', '/profile')).toBe('none');
  });
  it('pushes on top of Austausch, so the feed stays mounted', () => {
    expect(tabSwitchAction('explore', '/')).toBe('push');
    expect(tabSwitchAction('profile', '/')).toBe('push');
  });
  it('pops back (or replaces) everywhere else, so the stack never grows', () => {
    expect(tabSwitchAction('home', '/explore')).toBe('dismissTo');
    expect(tabSwitchAction('profile', '/explore')).toBe('dismissTo');
    expect(tabSwitchAction('explore', '/events')).toBe('dismissTo');
  });
});

describe('goToTab', () => {
  it('calls the router accordingly', () => {
    goToTab('explore', '/');
    expect(router.push).toHaveBeenCalledWith('/explore');
    goToTab('home', '/profile');
    expect(router.dismissTo).toHaveBeenCalledWith('/');
  });
});
