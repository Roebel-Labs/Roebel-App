/**
 * goToTab: Android/web must keep the exact call each site made before native
 * tabs; iOS must never stack a second tab controller.
 */
type RouterMock = {
  push: jest.Mock;
  replace: jest.Mock;
  dismissTo: jest.Mock;
  canDismiss: jest.Mock;
};

function load(os: 'ios' | 'android' | 'web', canDismiss = false) {
  let mod!: typeof import('../tabBar');
  const router: RouterMock = {
    push: jest.fn(),
    replace: jest.fn(),
    dismissTo: jest.fn(),
    canDismiss: jest.fn(() => canDismiss),
  };
  jest.resetModules();
  jest.doMock('react-native', () => ({ Platform: { OS: os } }));
  jest.doMock('expo-router', () => ({ router }));
  mod = require('../tabBar');
  return { mod, router };
}

describe('tabBar', () => {
  it('uses the system tab bar on iOS only', () => {
    expect(load('ios').mod.NATIVE_TABS).toBe(true);
    expect(load('android').mod.NATIVE_TABS).toBe(false);
    expect(load('web').mod.NATIVE_TABS).toBe(false);
  });

  it('reserves no extra bar height inside iOS tabs, 72 elsewhere', () => {
    expect(load('ios').mod.BOTTOM_NAV_HEIGHT).toBe(0);
    expect(load('android').mod.BOTTOM_NAV_HEIGHT).toBe(72);
    expect(load('ios').mod.ROOT_TAB_BAR_CLEARANCE).toBeGreaterThan(0);
  });

  it('Android: replace by default, push when the site pushed', () => {
    const { mod, router } = load('android', true);
    mod.goToTab('home');
    mod.goToTab('explore', 'push');
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(router.push).toHaveBeenCalledWith('/explore');
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('iOS from a pushed screen: pops back to the existing tab bar', () => {
    const { mod, router } = load('ios', true);
    mod.goToTab('profile');
    mod.goToTab('explore', 'push');
    expect(router.dismissTo).toHaveBeenNthCalledWith(1, '/profile');
    expect(router.dismissTo).toHaveBeenNthCalledWith(2, '/explore');
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('iOS inside the tab bar: a replace, which is a tab switch there', () => {
    const { mod, router } = load('ios', false);
    mod.goToTab('home', 'push');
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
