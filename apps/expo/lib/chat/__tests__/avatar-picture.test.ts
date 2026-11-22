import {
  MECKY_AVATAR_SPEC,
  MECKY_TILE_URL,
  botAnimationUrl,
  botInitial,
  botPictureUrl,
  botTileColor,
  centerSquareCrop,
  initialTextColor,
  isMeckyName,
} from '../avatar-picture';

describe('botPictureUrl (picture rule)', () => {
  const upload = 'https://x.supabase.co/storage/v1/object/public/images/chat/avatars/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.jpg';

  it('prefers the own picture', () => {
    expect(botPictureUrl({ imageUrl: upload, character: 'otto' }, 'Otto')).toBe(upload);
  });

  it('falls back to the character tile', () => {
    expect(botPictureUrl({ character: 'otto' }, 'Otto')).toBe('https://www.roebel.app/agents/otto/tile.webp');
  });

  it('shows Mecky for the bot named Mecky', () => {
    expect(botPictureUrl({}, 'Mecky')).toBe(MECKY_TILE_URL);
    expect(botPictureUrl({}, ' mecky ')).toBe(MECKY_TILE_URL);
    expect(MECKY_TILE_URL).toBe('https://www.roebel.app/agents/mecky/tile.webp');
    expect(botPictureUrl(MECKY_AVATAR_SPEC)).toBe(MECKY_TILE_URL);
  });

  it('returns null for everything else (initial tile)', () => {
    expect(botPictureUrl({}, 'Kochi')).toBeNull();
    expect(botPictureUrl({ character: 'berta' }, 'Berta')).toBeNull();
    expect(botPictureUrl(null)).toBeNull();
    expect(botPictureUrl({ imageUrl: 'http://insecure.example/a.jpg' }, 'X')).toBeNull();
    expect(botPictureUrl({ imageUrl: '' }, 'X')).toBeNull();
  });

  it('knows Mecky by name only', () => {
    expect(isMeckyName('Mecky')).toBe(true);
    expect(isMeckyName('Mecky 2')).toBe(false);
    expect(isMeckyName(undefined)).toBe(false);
  });
});

describe('initial tile', () => {
  it('takes the first letter or digit, upper-cased', () => {
    expect(botInitial('kochi')).toBe('K');
    expect(botInitial('  ölfreund')).toBe('Ö');
    expect(botInitial('🤖 Robo')).toBe('R');
    expect(botInitial('42 Antworten')).toBe('4');
    expect(botInitial('')).toBe('');
    expect(botInitial('***')).toBe('');
    expect(botInitial(null)).toBe('');
  });

  it('uses the character colour, else the spec colour, else navy', () => {
    expect(botTileColor({ color: '#111111', character: 'otto' })).toBe('#AFD6D2');
    expect(botTileColor({ color: '#FF5C03' })).toBe('#FF5C03');
    expect(botTileColor({ color: 'red' })).toBe('#00498B');
    expect(botTileColor(undefined)).toBe('#00498B');
  });

  it('picks a readable letter colour', () => {
    expect(initialTextColor('#000000')).toBe('#FFFFFF');
    expect(initialTextColor('#00498B')).toBe('#FFFFFF');
    expect(initialTextColor('#F0D79B')).toBe('#1C1C1E');
    expect(initialTextColor('nope')).toBe('#FFFFFF');
  });
});

describe('centerSquareCrop', () => {
  it('leaves square images alone', () => {
    expect(centerSquareCrop(512, 512)).toBeNull();
    expect(centerSquareCrop(512, 513)).toBeNull();
    expect(centerSquareCrop(0, 10)).toBeNull();
    expect(centerSquareCrop(Number.NaN, 10)).toBeNull();
  });

  it('crops the centre square of landscape and portrait images', () => {
    expect(centerSquareCrop(1600, 1200)).toEqual({ originX: 200, originY: 0, width: 1200, height: 1200 });
    expect(centerSquareCrop(1000, 1601)).toEqual({ originX: 0, originY: 300, width: 1000, height: 1000 });
  });
});

describe('botAnimationUrl', () => {
  const base = 'https://www.roebel.app/agents';

  it('animates characters, Mecky by name and house artwork', () => {
    expect(botAnimationUrl({ character: 'otto' }, 'Otto', 'idle')).toBe(`${base}/otto/idle.webp`);
    expect(botAnimationUrl(null, 'Mecky', 'writing')).toBe(`${base}/mecky/writing.webp`);
    expect(botAnimationUrl({ imageUrl: `${base}/lumi/tile.webp` }, 'Recherche', 'idle')).toBe(`${base}/lumi/idle.webp`);
    expect(botAnimationUrl({ imageUrl: MECKY_TILE_URL }, 'Assistent', 'writing')).toBe(`${base}/mecky/writing.webp`);
  });

  it('keeps own uploads, unknown art and plain bots still', () => {
    expect(botAnimationUrl({ imageUrl: 'https://x.supabase.co/a.jpg', character: 'otto' }, 'Otto', 'idle')).toBeNull();
    expect(botAnimationUrl({ imageUrl: `${base}/berta/tile.webp` }, 'Berta', 'idle')).toBeNull();
    expect(botAnimationUrl({ character: null }, 'Recherche', 'idle')).toBeNull();
  });
});
