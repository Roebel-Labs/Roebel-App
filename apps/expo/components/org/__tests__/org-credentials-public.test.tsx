/**
 * The public side of an org profile (spec 5.3 / 5.6b): offices always, public members only when
 * someone chose public, the org's badges with counts; orgs without register types keep the old
 * member section.
 */
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { Hex } from 'viem';

jest.mock('@/context/ThemeContext', () => {
  const { colors } = require('@/constants/theme');
  return { useTheme: () => ({ colors: colors.light, isDark: false }) };
});
jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (p: any) => <View {...p} /> };
});

import OrgCredentialsPublic, { replacesMemberSection } from '../OrgCredentialsPublic';
import type { OrgPublicView } from '@/lib/credreg/types';

const tid = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;
const person = (name: string) => ({ displayName: name, avatarUrl: null, username: null });

function render(el: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
}
const texts = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).flatMap((n) => [n.props.children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').map(String));

describe('OrgCredentialsPublic', () => {
  it('shows offices for a Fraktion and no member names when publicMembers is null', () => {
    const data: OrgPublicView = {
      offices: [{ typeId: tid(1), name: 'Vorsitz', recognised: true, holders: [person('Anna Alt')] }],
      publicMembers: null,
      badges: [],
      usesRegister: true,
    };
    const tree = render(<OrgCredentialsPublic data={data} />);
    const t = texts(tree);
    expect(t).toEqual(expect.arrayContaining(['Ämter', 'Vorsitz', 'Anna Alt']));
    expect(t).not.toContain('Mitglieder');
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Offizielles Amt der Stadt').length).toBeGreaterThan(0);
  });

  it('shows public members of a Verein that allows it', () => {
    const data: OrgPublicView = {
      offices: [],
      publicMembers: [person('Carla Cord'), person('Dora Dorn')],
      badges: [],
      usesRegister: true,
    };
    const t = texts(render(<OrgCredentialsPublic data={data} />));
    expect(t).toEqual(expect.arrayContaining(['Mitglieder', '2 Mitglieder']));
    expect(t).not.toContain('Ämter');
    // An empty list shows no section either.
    expect(texts(render(<OrgCredentialsPublic data={{ ...data, publicMembers: [] }} />))).not.toContain('Mitglieder');
  });

  it('keeps the old Mitglieder section for an org without register types', () => {
    const base: OrgPublicView = { offices: [], publicMembers: [], badges: [], usesRegister: false };
    expect(replacesMemberSection(base, true)).toBe(false);
    expect(replacesMemberSection(null, true)).toBe(false);
    expect(replacesMemberSection({ ...base, usesRegister: true }, false)).toBe(false);
    expect(replacesMemberSection({ ...base, usesRegister: true }, null)).toBe(false);
    expect(replacesMemberSection({ ...base, usesRegister: true }, true)).toBe(true);
  });

  it('renders org badges with their collected counts', () => {
    const data: OrgPublicView = {
      offices: [],
      publicMembers: null,
      badges: [{ typeId: tid(5), name: 'Dabei: Sommerfest', imageUrl: null, eventTitle: 'Sommerfest', collected: 42 }],
      usesRegister: false,
    };
    const t = texts(render(<OrgCredentialsPublic data={data} />));
    expect(t).toEqual(expect.arrayContaining(['Abzeichen dieser Organisation', 'Dabei: Sommerfest', '42 gesammelt']));
    for (const s of t) expect(s).not.toMatch(/0x[0-9a-fA-F]{6,}/);
  });
});
