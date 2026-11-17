import { describe, expect, it } from 'vitest';
import { agentPicture, houseArt } from '../agent/characters';
import { iconSpec } from '../agent/app-icon';

const UPLOAD = 'https://example.supabase.co/storage/v1/object/public/images/chat/avatars/0b8f4a52-2d1c-4f7e-9a51-3b0c2b1d9e10.jpg';

describe('picture rule', () => {
  it('maps house artwork to bundled art', () => {
    expect(houseArt('https://www.roebel.app/agents/mecky/tile.webp')).toBe('mecky');
    expect(houseArt('https://www.roebel.app/agents/wolke/tile.webp')).toMatchObject({ id: 'wolke' });
    expect(houseArt(UPLOAD)).toBeNull();
    expect(houseArt(null)).toBeNull();
  });

  it('own picture → character → Mecky → initial', () => {
    expect(agentPicture({ imageUrl: UPLOAD, characterId: 'olli' })).toEqual({ kind: 'image', url: UPLOAD });
    expect(agentPicture({ characterId: 'olli' })).toMatchObject({ kind: 'character', character: { id: 'olli' } });
    expect(agentPicture({ imageUrl: 'https://www.roebel.app/agents/lumi/tile.webp' })).toMatchObject({ kind: 'character', character: { id: 'lumi' } });
    expect(agentPicture({ mecky: true })).toEqual({ kind: 'mecky' });
    expect(agentPicture({ characterId: 'nobody' })).toEqual({ kind: 'initial' });
  });

  it('app icon follows the main assistant', () => {
    expect(iconSpec(null)).toBeNull();
    expect(iconSpec({ botId: 'x', defaultName: 'Wolke', characterId: 'wolke', isPreset: false })).toMatchObject({ key: 'c:wolke', fit: 'figure' });
    expect(iconSpec({ botId: 'x', defaultName: 'Kim', imageUrl: UPLOAD, isPreset: false })).toMatchObject({ key: `i:${UPLOAD}`, fit: 'cover', remote: true });
    expect(iconSpec({ botId: 'preset-mecky', defaultName: 'Mecky', isPreset: true })).toMatchObject({ key: 'mecky' });
    expect(iconSpec({ botId: 'x', defaultName: 'Kim', isPreset: false })).toBeNull();
  });
});
