import React from 'react';
import { Text, TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { TEMPLATES, type CardDesign, type Layer } from '@roebel/card-design';
import AiPromptBox, { placeAiResult } from '../designer/AiPromptBox';
import CredentialDetailSheet, { AI_IMAGES_NOTE } from '@/components/profile/CredentialDetailSheet';
import { designHasAi } from '@/lib/credreg/designs';
import type { RegisterCard } from '@/lib/credreg/model';

jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ colors: { border: '#ccc', textPrimary: '#000', textSecondary: '#666', primary: '#00498B', onPrimary: '#fff', error: '#c00', warning: '#a60' } }),
}));
jest.mock('@/components/BottomDrawer', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/profile/CredentialCard', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/credentials/StampCard', () => ({ __esModule: true, default: () => null }));

const design = TEMPLATES.find((t) => t.format !== 'stamp')!.design;
const sticker: Layer = { id: 'ai-sticker', type: 'image', role: 'sticker', assetId: 'c'.repeat(64), x: 10, y: 10, w: 100, h: 100, rotation: 0, opacity: 1, shine: false, ai: true };
const texts = (t: renderer.ReactTestRenderer) => t.root.findAllByType(Text).map((n) => [n.props.children].flat().join(''));

describe('AI prompt box', () => {
  it('offline: shows the network message and keeps the entered prompt', async () => {
    const generate = {
      background: jest.fn(async () => ({ ok: false as const, code: 'NETWORK_ERROR', message: 'Network request failed' })),
      sticker: jest.fn(),
    };
    const onResult = jest.fn();
    let t!: renderer.ReactTestRenderer;
    await act(async () => {
      t = renderer.create(<AiPromptBox kind="background" generate={generate} onResult={onResult} />);
    });
    await act(async () => t.root.findByType(TextInput).props.onChangeText('Müritz bei Nacht'));
    await act(async () => t.root.findByProps({ testID: 'ai-generate-background' }).props.onPress());
    expect(generate.background).toHaveBeenCalledWith('Müritz bei Nacht');
    expect(onResult).not.toHaveBeenCalled();
    expect(t.root.findByType(TextInput).props.value).toBe('Müritz bei Nacht');
    expect(texts(t)).toContain('Keine Verbindung. Bitte versuche es gleich noch einmal.');
  });

  it('a sticker result becomes a new top layer with ai: true', () => {
    const next = placeAiResult('sticker', { asset: { sha: 'c'.repeat(64), kind: 'sticker', url: '', width: 1, height: 1, ai: true }, layer: sticker })(design);
    expect(next.layers.length).toBe(design.layers.length + 1);
    expect(next.layers[next.layers.length - 1].ai).toBe(true);
  });
});

describe('AI notice on the credential detail', () => {
  const card = (d: CardDesign, extra: Partial<RegisterCard> = {}): RegisterCard => ({
    key: '0x1', source: 'register', kind: 'membership', title: 'Mitglied', orgName: 'Heimatverein', imageUrl: null, recognised: false,
    visibility: 'private', validUntil: null, state: 'valid', design: d, ...extra,
  });
  const render = (c: RegisterCard) => {
    let t!: renderer.ReactTestRenderer;
    act(() => {
      t = renderer.create(<CredentialDetailSheet card={c} onClose={() => undefined} onShow={() => undefined} onMakePrivate={() => undefined} />);
    });
    return texts(t);
  };

  it('shows "Enthält KI-generierte Bilder" for a design with an ai layer', () => {
    const withAi = { ...design, layers: [...design.layers, sticker] };
    expect(designHasAi(withAi)).toBe(true);
    expect(render(card(withAi))).toContain(AI_IMAGES_NOTE);
    expect(AI_IMAGES_NOTE).toBe('Enthält KI-generierte Bilder');
  });

  it('shows it when the server marks an AI background, and not otherwise', () => {
    expect(render(card(design, { designAi: true }))).toContain(AI_IMAGES_NOTE);
    expect(designHasAi(design)).toBe(false);
    expect(render(card(design))).not.toContain(AI_IMAGES_NOTE);
  });
});
