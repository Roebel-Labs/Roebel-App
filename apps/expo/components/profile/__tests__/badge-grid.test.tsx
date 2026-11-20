/**
 * The "Abzeichen" collection: year groups of stamp tiles, an explanation when empty (own profile
 * only), and the sheet of a waiting badge without the public/private actions.
 */
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { Hex } from 'viem';
import type { RegisterCard } from '@/lib/credreg/model';

jest.mock('@/context/ThemeContext', () => {
  const { colors } = require('@/constants/theme');
  return { useTheme: () => ({ colors: colors.light, isDark: false }) };
});
jest.mock('@/components/BottomDrawer', () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? children : null),
}));

import BadgeGrid, { BADGE_EMPTY_TEXT, hasCollectedStamp } from '../BadgeGrid';
import CredentialDetailSheet, { PENDING_BADGE_TEXT } from '../CredentialDetailSheet';

const tid = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;
const card = (n: number, eventDate: string): RegisterCard => ({
  key: tid(n), source: 'register', typeId: tid(n), kind: 'badge', title: `Abzeichen ${n}`, orgName: 'Verein', imageUrl: null,
  recognised: false, visibility: 'public', validUntil: null, state: 'valid', eventId: `e${n}`, eventTitle: `Fest ${n}`, eventDate,
});

function render(el: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
}
const texts = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).flatMap((n) => [n.props.children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').map(String));
const buttons = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'button').map((n) => n.props.accessibilityLabel as string);

describe('stamp section on the own profile', () => {
  it('appears only after the first collected stamp', () => {
    expect(hasCollectedStamp([], [])).toBe(false);
    expect(hasCollectedStamp([{}], [])).toBe(true);
    // Scanned offline, waiting to be sent: collected from the person's view.
    expect(hasCollectedStamp([], ['event-1'])).toBe(true);
  });
});

describe('BadgeGrid', () => {
  it('empty grid shows the collect-your-first explanation', () => {
    const own = render(<BadgeGrid badges={[]} onPress={() => {}} emptyState />);
    expect(texts(own)).toEqual(expect.arrayContaining(['Abzeichen', BADGE_EMPTY_TEXT]));
    expect(BADGE_EMPTY_TEXT).toBe('Noch keine Abzeichen. Scanne bei einer Veranstaltung den QR-Code am Eingang, dann landet dein erstes Abzeichen hier.');
    // Another person's profile keeps rendering nothing.
    expect(render(<BadgeGrid badges={[]} onPress={() => {}} />).toJSON()).toBeNull();
  });

  it('renders one sub-heading per year with stamp tiles', () => {
    const onPressTile = jest.fn();
    const tree = render(
      <BadgeGrid
        badges={[card(1, '2025-05-01'), card(2, '2026-02-01')]}
        pending={[{ eventId: 'e9', eventTitle: 'Herbstfest', eventDate: '2026-10-01', orgName: null, typeId: null, name: 'Dabei: Herbstfest', imageUrl: null, state: 'waiting_for_issue' }]}
        onPress={() => {}}
        onPressTile={onPressTile}
      />,
    );
    const t = texts(tree);
    expect(t.indexOf('2026')).toBeLessThan(t.indexOf('2025'));
    expect(t).toEqual(expect.arrayContaining(['Dabei: Herbstfest', 'wird eingetragen', 'Abzeichen 2']));
  });

  it('a pending tile opens a sheet without the visibility switch', () => {
    const onPressTile = jest.fn();
    const tree = render(
      <BadgeGrid
        badges={[]}
        pending={[{ eventId: 'e9', eventTitle: 'Herbstfest', eventDate: '2026-10-01', orgName: 'Verein', typeId: null, name: 'Dabei: Herbstfest', imageUrl: null, state: 'waiting_for_issue' }]}
        onPress={() => {}}
        onPressTile={onPressTile}
      />,
    );
    const tile = tree.root.find((n) => typeof n.type !== 'string' && n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
    act(() => tile.props.onPress());
    expect(onPressTile).toHaveBeenCalledWith(expect.objectContaining({ state: 'pending', card: null }));
    const pendingTile = onPressTile.mock.calls[0][0];
    const sheet = render(<CredentialDetailSheet card={null} tile={pendingTile} onClose={() => {}} onShow={() => {}} onMakePrivate={() => {}} onMakePublic={() => {}} />);
    const st = texts(sheet);
    expect(st).toEqual(expect.arrayContaining(['Dabei: Herbstfest', 'Herbstfest', 'Verein', PENDING_BADGE_TEXT]));
    expect(PENDING_BADGE_TEXT).toBe('Wird eingetragen, sobald der Veranstalter die Abzeichen vergibt.');
    expect(buttons(sheet)).not.toEqual(expect.arrayContaining(['Öffentlich zeigen']));
    expect(buttons(sheet)).not.toEqual(expect.arrayContaining(['Privat machen']));
    expect(buttons(sheet)).not.toEqual(expect.arrayContaining(['Vorzeigen']));
  });

  it('a collected badge sheet shows the stamp, event and "Teilen"', () => {
    const onShare = jest.fn();
    const c = card(3, '2026-06-01');
    const sheet = render(<CredentialDetailSheet card={c} onClose={() => {}} onShow={() => {}} onMakePrivate={() => {}} onShare={onShare} />);
    expect(texts(sheet)).toEqual(expect.arrayContaining(['Abzeichen 3', 'Fest 3', '1. Juni 2026']));
    expect(buttons(sheet)).toEqual(expect.arrayContaining(['Vorzeigen', 'Teilen', 'Privat machen']));
  });
});
