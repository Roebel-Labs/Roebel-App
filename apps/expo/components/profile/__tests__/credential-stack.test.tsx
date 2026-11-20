/**
 * Profile cards from the credential register: closed gate = today's profile, nothing fetched;
 * open gate = register cards after the built-in ones, badges in their own grid, never an address.
 */
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { Hex } from 'viem';
import type { RegisterCard } from '@/lib/credreg/model';
import type { HeldCredential } from '@/lib/credreg/held';

// ThemeContext imports AsyncStorage, which has no native module under jest.
jest.mock('@/context/ThemeContext', () => {
  const { colors } = require('@/constants/theme');
  return { useTheme: () => ({ colors: colors.light, isDark: false }) };
});
jest.mock('@/components/PressableScale', () => {
  const { Pressable } = require('react-native');
  return { __esModule: true, default: Pressable };
});
jest.mock('@/components/BottomDrawer', () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? children : null),
}));

let mockGate: boolean | null = false;
jest.mock('@/lib/credreg/gate', () => ({
  useCredentialsGate: () => mockGate,
  credentialsConfigured: () => true,
}));
const mockFetchMine = jest.fn();
jest.mock('@/lib/credreg/api', () => ({ fetchMine: (...a: unknown[]) => mockFetchMine(...a) }));
let mockHeld: HeldCredential[] = [];
const mockUseHeld = jest.fn(() => ({ held: mockHeld, pending: [], refresh: async () => {}, loading: false }));
jest.mock('@/lib/credreg/held', () => ({ useHeld: () => mockUseHeld() }));

import CredentialCardStack from '../CredentialCardStack';
import BadgeGrid from '../BadgeGrid';
import CredentialDetailSheet from '../CredentialDetailSheet';
import { useProfileCredentials } from '@/hooks/useProfileCredentials';

const NOW = Math.floor(Date.now() / 1000);
const tid = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;
const ADDR = '0x' + 'ab'.repeat(20);

const held = (over: Partial<HeldCredential> & { typeId: Hex }): HeldCredential => ({
  kind: 'membership',
  title: 'Mitglied',
  orgName: 'Verein',
  imageUrl: null,
  recognised: false,
  visibility: 'public',
  validUntil: null,
  invitationId: 'inv',
  claim: null,
  ...over,
});

function Harness({ isCitizen, isAttester }: { isCitizen: boolean; isAttester: boolean }) {
  const { profile, loader, open } = useProfileCredentials({ isCitizen, isAttester });
  return (
    <>
      {loader}
      <CredentialCardStack cards={profile.cards} onPress={() => {}} />
      {open && <BadgeGrid badges={profile.badges} onPress={() => {}} />}
    </>
  );
}

function render(el: React.ReactElement): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
}

const imageLabels = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'image')
    .map((n) => n.props.accessibilityLabel as string);
const buttonLabels = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'button')
    .map((n) => n.props.accessibilityLabel as string);
const texts = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).flatMap((n) => [n.props.children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').map(String));
const hasLabel = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === label).length > 0;

beforeEach(() => {
  mockGate = false;
  mockHeld = [];
  mockUseHeld.mockClear();
  mockFetchMine.mockClear();
});

describe('profile credential cards', () => {
  it("renders today's three built-in cards unchanged when the gate is closed", () => {
    mockHeld = [held({ typeId: tid(1) })]; // must never show up
    const guest = render(<Harness isCitizen={false} isAttester={false} />);
    expect(imageLabels(guest)).toEqual(['Gastkarte']);
    expect(buttonLabels(guest)).toEqual(['Gastkarte anzeigen']);
    const citizen = render(<Harness isCitizen isAttester={false} />);
    expect(imageLabels(citizen)).toEqual(['Bürgerausweis']);
    expect(buttonLabels(citizen)).toEqual(['Bürgerausweis anzeigen']);
    const attester = render(<Harness isCitizen isAttester />);
    expect(imageLabels(attester)).toEqual(['Bürgerausweis', 'Bescheiniger-Ausweis']);
    expect(buttonLabels(attester)).toEqual(['Bescheiniger-Ausweis anzeigen']);
    expect(texts(attester)).not.toContain('Abzeichen');
  });

  it('makes no credential request when the gate is closed', () => {
    for (const g of [false, null]) {
      mockGate = g;
      render(<Harness isCitizen isAttester={false} />);
    }
    expect(mockUseHeld).not.toHaveBeenCalled();
    expect(mockFetchMine).not.toHaveBeenCalled();
  });

  it('shows register cards after the built-in ones and a seal on a recognised role', () => {
    mockGate = true;
    mockHeld = [
      held({ typeId: tid(1), kind: 'membership', title: 'Mitglied im Angelverein', orgName: 'Angelverein' }),
      held({ typeId: tid(2), kind: 'role', title: 'Bürgermeister', orgName: 'Stadt Röbel', recognised: true }),
    ];
    const tree = render(<Harness isCitizen isAttester={false} />);
    const labels = imageLabels(tree);
    expect(labels[0]).toBe('Bürgerausweis');
    expect(labels[1]).toMatch(/^Bürgermeister/);
    expect(labels[2]).toMatch(/^Mitglied im Angelverein/);
    expect(mockUseHeld).toHaveBeenCalled();
    const seals = tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === 'Offizielles Amt der Stadt');
    expect(seals).toHaveLength(1);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Bürgermeister', 'Stadt Röbel', 'Amt', 'Mitglied']));
  });

  it('shows "Privat" on a private card and "Abgelaufen" on an expired one', () => {
    const base: Omit<RegisterCard, 'key' | 'title' | 'visibility' | 'state'> = {
      source: 'register',
      kind: 'membership',
      orgName: 'Verein',
      imageUrl: null,
      recognised: false,
      validUntil: null,
    };
    const cards: RegisterCard[] = [
      { ...base, key: tid(1), typeId: tid(1), title: 'Privat-Karte', visibility: 'private', state: 'valid' },
      { ...base, key: tid(2), typeId: tid(2), title: 'Alte Karte', visibility: 'public', state: 'expired', validUntil: NOW - 86_400 },
    ];
    const tree = render(<CredentialCardStack cards={cards} onPress={() => {}} />);
    const t = texts(tree);
    expect(t).toContain('Privat');
    expect(t).toContain('Abgelaufen');
    expect(imageLabels(tree)).toEqual(['Privat-Karte, Verein, Privat', 'Alte Karte, Verein, Abgelaufen']);
  });

  it('BadgeGrid renders nothing without badges and three tiles for three badges', () => {
    const empty = render(<BadgeGrid badges={[]} onPress={() => {}} />);
    expect(empty.toJSON()).toBeNull();
    const badge = (n: number): RegisterCard => ({
      key: tid(n),
      source: 'register',
      typeId: tid(n),
      kind: 'badge',
      title: `Abzeichen ${n}`,
      orgName: null,
      imageUrl: n === 1 ? 'https://example.org/b.png' : null,
      recognised: false,
      visibility: 'public',
      validUntil: null,
      state: 'valid',
    });
    const onPress = jest.fn();
    const tree = render(<BadgeGrid badges={[badge(1), badge(2), badge(3)]} onPress={onPress} />);
    expect(texts(tree)).toContain('Abzeichen');
    const tiles = tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && typeof n.type !== 'string');
    expect(tiles).toHaveLength(3);
    act(() => tiles[1].props.onPress());
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ title: 'Abzeichen 2' }));
  });

  it('no rendered text matches /0x[0-9a-fA-F]{6,}/', () => {
    mockGate = true;
    mockHeld = [
      held({ typeId: tid(1), kind: 'role', title: 'Kassenwart', recognised: true, validUntil: NOW + 86_400 * 400 }),
      held({ typeId: tid(2), kind: 'badge', title: 'Helfer 2026', orgName: null, visibility: 'private' }),
    ];
    function Screen() {
      const { profile, loader } = useProfileCredentials({ isCitizen: true, isAttester: true });
      return (
        <>
          {loader}
          <CredentialCardStack cards={profile.cards} onPress={() => {}} />
          <BadgeGrid badges={profile.badges} onPress={() => {}} />
          <CredentialDetailSheet card={profile.cards[profile.cards.length - 1]} onClose={() => {}} onShow={() => {}} onMakePrivate={() => {}} onMakePublic={() => {}} />
        </>
      );
    }
    const tree = render(<Screen />);
    const all = texts(tree);
    expect(all.length).toBeGreaterThan(3);
    for (const s of all) expect(s).not.toMatch(/0x[0-9a-fA-F]{6,}/);
    const labels = tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string);
    for (const s of labels) expect(s).not.toMatch(/0x[0-9a-fA-F]{6,}/);
    expect(JSON.stringify(tree.toJSON())).not.toContain(ADDR.slice(2, 10));
  });
});

describe('CredentialDetailSheet', () => {
  const card = (over: Partial<RegisterCard> = {}): RegisterCard => ({
    key: tid(5),
    source: 'register',
    typeId: tid(5),
    kind: 'membership',
    title: 'Mitglied',
    orgName: 'Verein',
    imageUrl: null,
    recognised: false,
    visibility: 'public',
    validUntil: Date.UTC(2027, 11, 31, 12) / 1000,
    state: 'valid',
    benefits: ['Freier Eintritt'],
    ...over,
  });
  const props = () => ({ onClose: jest.fn(), onShow: jest.fn(), onMakePrivate: jest.fn(), onMakePublic: jest.fn() });

  it('shows validity, benefits and "Privat machen" only after the explanation', () => {
    const p = props();
    const tree = render(<CredentialDetailSheet card={card()} {...p} />);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Gültig bis 31.12.2027', 'Freier Eintritt', 'Vorzeigen']));
    const open = tree.root.findAll((n) => n.props.accessibilityLabel === 'Privat machen' && typeof n.props.onPress === 'function')[0];
    act(() => open.props.onPress());
    expect(p.onMakePrivate).not.toHaveBeenCalled();
    expect(texts(tree).join(' ')).toContain('bleibt im Verlauf des Registers dauerhaft sichtbar');
    const confirm = tree.root.findAll((n) => n.props.accessibilityLabel === 'Privat machen' && typeof n.props.onPress === 'function');
    expect(confirm).toHaveLength(1);
    act(() => confirm[0].props.onPress());
    expect(p.onMakePrivate).toHaveBeenCalledWith(expect.objectContaining({ typeId: tid(5) }));
  });

  it('private card: "Öffentlich zeigen" when allowed, the org line otherwise', () => {
    const allowed = render(<CredentialDetailSheet card={card({ visibility: 'private', validUntil: null })} {...props()} />);
    expect(texts(allowed)).toEqual(expect.arrayContaining(['Unbefristet', 'Öffentlich zeigen']));
    const closed = render(<CredentialDetailSheet card={card({ visibility: 'private', publicAllowed: false })} {...props()} />);
    expect(texts(closed)).toContain('Diese Organisation zeigt ihre Mitglieder nicht öffentlich.');
    expect(texts(closed)).not.toContain('Öffentlich zeigen');
  });

  it('an expired card offers neither "Privat machen" nor "Öffentlich zeigen"', () => {
    const tree = render(<CredentialDetailSheet card={card({ state: 'expired', validUntil: NOW - 86_400 })} {...props()} />);
    const t = texts(tree);
    expect(t).toContain('Abgelaufen');
    expect(hasLabel(tree, 'Privat machen')).toBe(false);
    expect(hasLabel(tree, 'Öffentlich zeigen')).toBe(false);
  });

  it('renders nothing for no card', () => {
    expect(render(<CredentialDetailSheet card={null} {...props()} />).toJSON()).toBeNull();
  });
});
