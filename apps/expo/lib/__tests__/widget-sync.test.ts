/**
 * Widget sync: logged-out users get no unread query, failed icons fall back to letter tiles.
 */
const mockPushed: any[] = [];
const mockNotificationsFrom = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../supabase', () => ({ supabase: { from: (...a: any[]) => mockNotificationsFrom(...a) } }));
jest.mock('../miniapps', () => ({
  fetchLiveMiniApps: jest.fn(async () => [
    { slug: 'a', name: 'A', iconUrl: 'https://x/a.png', primaryColor: '#111', featured: true },
    { slug: 'b', name: 'B', iconUrl: null, primaryColor: '#222', featured: true },
  ]),
}));
// Mittagstisch / Diese Woche sync has its own queries (widget-content tests); keep this suite on Mini Apps.
jest.mock('../widget-content-sync', () => ({ syncContentWidgets: jest.fn(async () => {}) }));
jest.mock('../miniapp-installs', () => ({ getInstalledMiniAppSlugs: jest.fn(async () => []) }));
jest.mock('../widget-platform', () => ({ pushToPlatform: jest.fn(async (p: any) => mockPushed.push(p)) }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  Directory: jest.fn().mockImplementation(() => ({ exists: true, create: jest.fn() })),
  File: { downloadFileAsync: jest.fn(async () => { throw new Error('offline'); }) },
}));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: jest.fn() }, SaveFormat: { PNG: 'png' } }));

import { syncWidget, setWidgetSelection, readStoredPayload } from '../widget-sync';

beforeEach(() => {
  mockPushed.length = 0;
  mockNotificationsFrom.mockReset();
});

it('logged out: no notification query, no dots (Review Focus 4)', async () => {
  const p = await syncWidget(null);
  expect(mockNotificationsFrom).not.toHaveBeenCalled();
  expect(p?.apps.map((a) => a.unread)).toEqual([false, false]);
  expect(mockPushed).toHaveLength(1);
});

it('a failed icon download still syncs with a letter tile (Review Focus 3)', async () => {
  const p = await syncWidget(null);
  expect(p?.apps[0]).toMatchObject({ slug: 'a', icon: null });
  expect((await readStoredPayload())?.apps).toHaveLength(2);
});

it('logged in: unread slugs come from mini_app notifications', async () => {
  const q: any = { select: () => q, eq: () => q, limit: async () => ({ data: [{ metadata: { slug: 'b' } }], error: null }) };
  mockNotificationsFrom.mockReturnValue(q);
  const p = await syncWidget('0xABC');
  expect(mockNotificationsFrom).toHaveBeenCalledWith('notifications');
  expect(p?.apps.find((a) => a.slug === 'b')?.unread).toBe(true);
  expect(p?.apps.find((a) => a.slug === 'a')?.unread).toBe(false);
});

it('the saved selection drives the widget', async () => {
  await setWidgetSelection(['b'], null);
  expect(mockPushed.at(-1).apps.map((a: any) => a.slug)).toEqual(['b']);
});
