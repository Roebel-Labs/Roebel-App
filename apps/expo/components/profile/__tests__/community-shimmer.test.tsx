/**
 * Community cards (Gast, Bürger, Bescheiniger): the front/active card is drawn from its design so the
 * sheen follows the phone; static cards and binaries without Skia keep the PNG art.
 */
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Image } from 'react-native';
import { TEMPLATES } from '@roebel/card-design';

jest.mock('@/context/ThemeContext', () => {
  const { colors } = require('@/constants/theme');
  return { useTheme: () => ({ colors: colors.light, isDark: false }) };
});
const mockRendered: Array<{ animate?: string; design: unknown }> = [];
jest.mock('@/components/credentials/DesignedCard', () => ({
  __esModule: true,
  default: (p: { animate?: string; design: unknown }) => {
    mockRendered.push(p);
    return null;
  },
}));

import CredentialCard from '../CredentialCard';
import { COMMUNITY_DESIGNS } from '@/lib/card-design/community';
import { setSkiaAvailableForTests } from '@/lib/card-design/skia-available';
import { resetDesignedCardForTests } from '@/components/credentials/SafeDesignedCard';

beforeEach(() => {
  mockRendered.length = 0;
  resetDesignedCardForTests();
});
afterAll(() => setSkiaAvailableForTests(null));

const render = (el: React.ReactElement) => {
  let t!: renderer.ReactTestRenderer;
  act(() => {
    t = renderer.create(el);
  });
  return t;
};

describe('community card shimmer', () => {
  it('maps each community card to its template (no name field)', () => {
    expect(COMMUNITY_DESIGNS.guest).toBe(TEMPLATES.find((t) => t.id === 'gast')!.design);
    expect(COMMUNITY_DESIGNS.citizen).toBe(TEMPLATES.find((t) => t.id === 'buerger')!.design);
    expect(COMMUNITY_DESIGNS.attester).toBe(TEMPLATES.find((t) => t.id === 'bescheiniger')!.design);
    for (const d of Object.values(COMMUNITY_DESIGNS)) expect(d.layers.some((l) => l.type === 'field')).toBe(false);
  });

  it('the tilting card is drawn from the design with animate="tilt"', () => {
    setSkiaAvailableForTests(true);
    render(<CredentialCard kind="citizen" width={300} animate="tilt" />);
    expect(mockRendered).toHaveLength(1);
    expect(mockRendered[0].animate).toBe('tilt');
    expect(mockRendered[0].design).toBe(COMMUNITY_DESIGNS.citizen);
  });

  it('a static card keeps the PNG and never loads Skia', () => {
    setSkiaAvailableForTests(true);
    const t = render(<CredentialCard kind="citizen" width={300} />);
    expect(mockRendered).toHaveLength(0);
    expect(t.root.findAllByType(Image)).toHaveLength(1);
  });

  it('without Skia in the binary the tilting card falls back to the PNG', () => {
    setSkiaAvailableForTests(false);
    const t = render(<CredentialCard kind="guest" width={300} animate="tilt" />);
    expect(mockRendered).toHaveLength(0);
    expect(t.root.findAllByType(Image)).toHaveLength(1);
  });
});
