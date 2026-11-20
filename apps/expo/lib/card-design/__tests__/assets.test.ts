import { TEMPLATES, LOGO_SLOT_ASSET } from '@roebel/card-design';

jest.mock('@shopify/react-native-skia', () => ({ Skia: {} }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/' }));
jest.mock('../skia', () => ({ BUILTIN_MODULES: {}, moduleUri: () => '' }));

import { clearDecodedImages, designAssetIds, loadImages } from '../assets';

const img = { width: () => 10, height: () => 10 };

beforeEach(() => clearDecodedImages());

describe('design images', () => {
  it('lists background and image layers, never the empty logo slot', () => {
    const design = TEMPLATES.find((t) => t.id === 'schwarz')!.design;
    const ids = designAssetIds(design);
    expect(ids).not.toContain(LOGO_SLOT_ASSET);
    expect(ids).toContain('builtin:roebel-mark');
  });

  it('leaves a failing image out and tries it again on the next load', async () => {
    let online = false;
    const source = jest.fn(async (id: string) => {
      if (id === 'b' && !online) throw new Error('offline');
      return img;
    });
    const first = await loadImages(['a', 'b'], source);
    expect([...first.keys()]).toEqual(['a']);
    online = true;
    const second = await loadImages(['a', 'b'], source);
    expect([...second.keys()]).toEqual(['a', 'b']);
    // 'a' was decoded once and shared.
    expect(source.mock.calls.filter(([id]) => id === 'a')).toHaveLength(1);
  });
});
