import { backPress, eventsFor, type HostSignals } from '../miniapp-host-events';

const on: HostSignals = { open: true, appActive: true, dark: false };

describe('eventsFor', () => {
  it('sends nothing on the first signal', () => expect(eventsFor(null, on)).toEqual([]));

  it('sends nothing when nothing changed', () => expect(eventsFor(on, { ...on })).toEqual([]));

  it('backgrounding the app hides, returning shows', () => {
    expect(eventsFor(on, { ...on, appActive: false })).toEqual([{ event: 'visibilityChanged', data: { visible: false } }]);
    expect(eventsFor({ ...on, appActive: false }, on)).toEqual([{ event: 'visibilityChanged', data: { visible: true } }]);
  });

  it('closing the host hides', () =>
    expect(eventsFor(on, { ...on, open: false })).toEqual([{ event: 'visibilityChanged', data: { visible: false } }]));

  it('a theme switch while open is reported', () => {
    expect(eventsFor(on, { ...on, dark: true })).toEqual([{ event: 'themeChanged', data: { theme: 'dark' } }]);
    expect(eventsFor({ ...on, dark: true }, on)).toEqual([{ event: 'themeChanged', data: { theme: 'light' } }]);
  });

  it('a theme switch while closed is not', () =>
    expect(eventsFor({ ...on, open: false }, { ...on, open: false, dark: true })).toEqual([]));

  it('a theme switch in the background is still reported (the page is open)', () =>
    expect(eventsFor({ ...on, appActive: false }, { ...on, appActive: false, dark: true })).toEqual([
      { event: 'themeChanged', data: { theme: 'dark' } },
    ]));
});

describe('backPress', () => {
  it('back closes unless the app said it handles it', () => {
    expect(backPress(false)).toBe('close');
    expect(backPress(true)).toBe('event');
  });
});
