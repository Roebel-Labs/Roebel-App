import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TEMPLATES, type CardDesign } from '@roebel/card-design';
import { diffRatio, loadHeadlessSkia, renderRgba } from '@/lib/card-design/test-utils/headless-skia';
import { recordDesign } from '@/lib/card-design/record';
import DesignedCard from '../DesignedCard';

jest.setTimeout(60000);

// RN Skia's real object model (headless CanvasKit) behind the module, host stand-ins for the views.
let mockHeadless: Awaited<ReturnType<typeof loadHeadlessSkia>> | null = null;
const mockPictures: unknown[] = [];
jest.mock('@shopify/react-native-skia', () => {
  const { View } = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  return {
    Skia: new Proxy({}, { get: (_t, k) => (mockHeadless!.Skia as Record<string | symbol, unknown>)[k] }),
    Canvas: ({ children }: { children: React.ReactNode }) => R.createElement(View, { testID: 'skia-canvas' }, children),
    Picture: ({ picture }: { picture: unknown }) => {
      // A tilting card passes the derived value; it must never hold null (review I3).
      const p = picture && typeof picture === 'object' && 'value' in (picture as object) ? (picture as { value: unknown }).value : picture;
      mockPictures.push(p);
      return null;
    },
  };
});
jest.mock('@/lib/card-design/skia', () => ({
  useCardSkia: () => (mockHeadless ? { api: mockHeadless.api, fonts: mockHeadless.fonts } : null),
  useCardSkiaState: () => ({ skia: mockHeadless ? { api: mockHeadless.api, fonts: mockHeadless.fonts } : null, failed: false }),
}));
jest.mock('@/lib/card-design/assets', () => ({
  // The org logo (a sha) never arrives: offline.
  useDesignImages: () => new Map(),
}));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { out: () => () => 0, quad: () => 0 },
    useReducedMotion: () => false,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
  };
});
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('expo-sensors', () => ({
  DeviceMotion: { setUpdateInterval: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })) },
}));
jest.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ colors: { surface: '#eee' } }) }));

const SHA = 'a'.repeat(64);
const memberCard = (): CardDesign => {
  const base = TEMPLATES.find((t) => t.id === 'schwarz')!.design;
  return {
    ...base,
    layers: base.layers.map((l) => (l.type === 'image' && l.role === 'logo' ? { ...l, assetId: SHA } : l)),
  };
};

beforeAll(async () => {
  mockHeadless = await loadHeadlessSkia();
});

describe('DesignedCard', () => {
  it('draws a card whose image is missing without throwing (and not blank)', async () => {
    const design = memberCard();
    expect(() => {
      act(() => {
        renderer.create(<DesignedCard design={design} width={300} mode="holder" animate="tilt" />);
      });
    }).not.toThrow();
    expect(mockPictures.at(-1)).toBeTruthy();
    const out = await renderRgba(design, { width: 300, mode: 'holder', shinePhase: 0.35, images: new Map() });
    let opaque = 0;
    for (let i = 3; i < out.data.length; i += 4) if (out.data[i] > 0) opaque++;
    expect(opaque / (out.width * out.height)).toBeGreaterThan(0.9);
  });

  it('records a picture through the RN Skia object model', async () => {
    const h = await loadHeadlessSkia();
    const pic = recordDesign(h.Skia as never, h.api, memberCard(), {
      width: 300, mode: 'preview', images: h.images, fonts: h.fonts, shinePhase: 0.35,
    });
    expect(pic).not.toBeNull();
  });

  it('draws the holder name in holder mode', async () => {
    const design = memberCard();
    const opts = { width: 462, mode: 'holder' as const, shinePhase: 0.35 };
    const without = await renderRgba(design, opts);
    const withName = await renderRgba(design, { ...opts, values: { holderName: 'Erika Mustermann' } });
    expect(diffRatio(without.data, withName.data)).toBeGreaterThan(0.002);
  });
});

describe('tilt redraws', () => {
  it('are quantised: sensor noise does not redraw, a real tilt does', () => {
    const { quantiseTilt, sameTilt } = jest.requireActual('@/lib/card-design/record');
    const a = quantiseTilt({ x: 0.2001, y: -0.1 });
    expect(sameTilt(a, quantiseTilt({ x: 0.2049, y: -0.1049 }))).toBe(true);
    expect(sameTilt(a, quantiseTilt({ x: 0.26, y: -0.1 }))).toBe(false);
  });
});

describe('SafeDesignedCard', () => {
  it('shows the fallback without loading Skia when the binary has no Skia', () => {
    const { setSkiaAvailableForTests } = jest.requireActual('@/lib/card-design/skia-available');
    const { default: SafeDesignedCard, resetDesignedCardForTests } = jest.requireActual('../SafeDesignedCard');
    const { Text } = jest.requireActual('react-native');
    setSkiaAvailableForTests(false);
    resetDesignedCardForTests();
    let t!: renderer.ReactTestRenderer;
    act(() => {
      t = renderer.create(<SafeDesignedCard design={memberCard()} width={300} mode="holder" fallback={<Text>PNG</Text>} />);
    });
    expect(t.root.findAllByType(Text).map((n) => n.props.children)).toEqual(['PNG']);
    expect(t.root.findAllByProps({ testID: 'designed-card' })).toHaveLength(0);
    setSkiaAvailableForTests(true);
    resetDesignedCardForTests();
    act(() => {
      t = renderer.create(<SafeDesignedCard design={memberCard()} width={300} mode="holder" fallback={<Text>PNG</Text>} />);
    });
    expect(t.root.findAllByProps({ testID: 'designed-card' }).length).toBeGreaterThan(0);
    setSkiaAvailableForTests(null);
  });
});
