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
    Picture: ({ picture }: { picture: unknown }) => { mockPictures.push(picture); return null; },
  };
});
jest.mock('@/lib/card-design/skia', () => ({
  useCardSkia: () => (mockHeadless ? { api: mockHeadless.api, fonts: mockHeadless.fonts } : null),
}));
jest.mock('@/lib/card-design/assets', () => ({
  // The org logo (a sha) never arrives: offline.
  useDesignImages: () => new Map(),
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  useReducedMotion: () => false,
  useSharedValue: (v: unknown) => ({ value: v }),
}));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
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
