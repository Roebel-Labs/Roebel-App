jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async () => '',
}));

import {
  buildPosterDraft,
  parseProposeResponse,
  directionLabel,
  variantLetter,
} from '../poster-api';

const IMG = 'https://wwbeqhkslxdxhktqzqti.supabase.co/storage/v1/object/public/images/event-images/a.jpg';

describe('buildPosterDraft', () => {
  it('maps the recap onto the server draft and drops empty fields', () => {
    expect(
      buildPosterDraft({
        title: '  HEIMSPIEL  ',
        date: '2026-10-10',
        time: '15:00',
        end_time: '',
        location: 'Friesensportplatz',
        category: 'Sport',
        ticket_price: 3,
        organizer_name: 'PSV Röbel/Müritz e. V.',
        organizer_email: 'x@y.de',
        max_attendees: 200,
        image_url: IMG,
      }),
    ).toEqual({
      title: 'HEIMSPIEL',
      date: '2026-10-10',
      time: '15:00',
      location: 'Friesensportplatz',
      category: 'Sport',
      ticket_price: 3,
      organizer_name: 'PSV Röbel/Müritz e. V.',
      image_url: IMG,
    });
  });

  it('uses the first recurring date when there is no single date', () => {
    expect(buildPosterDraft({ title: 'Kurs', dates: ['2026-10-01', '2026-10-08'] })?.date).toBe('2026-10-01');
  });

  it('keeps a free price of 0 and a numeric string price', () => {
    expect(buildPosterDraft({ title: 'X', ticket_price: 0 })?.ticket_price).toBe(0);
    expect(buildPosterDraft({ title: 'X', ticket_price: '12.50' })?.ticket_price).toBe('12.50');
  });

  it('refuses a draft without a title and drops non-https images', () => {
    expect(buildPosterDraft({ title: '   ' })).toBeNull();
    expect(buildPosterDraft(null)).toBeNull();
    expect(buildPosterDraft({ title: 'X', image_url: 'file:///local.jpg' })?.image_url).toBeUndefined();
  });
});

describe('parseProposeResponse', () => {
  const proposal = (variant: 1 | 2, direction: string) => ({
    id: `id-${variant}`,
    variant,
    direction,
    image_url: `https://example.supabase.co/p${variant}.jpg`,
  });

  it('returns both proposals sorted by variant', () => {
    const out = parseProposeResponse(200, {
      success: true,
      batchId: 'b1',
      mode: 'design',
      ratio: 'square',
      proposals: [proposal(2, 'editorial'), proposal(1, 'plakativ')],
    });
    expect(out.kind).toBe('proposals');
    if (out.kind === 'proposals') {
      expect(out.mode).toBe('design');
      expect(out.proposals.map((p) => p.direction)).toEqual(['plakativ', 'editorial']);
    }
  });

  it('keeps a single surviving variant', () => {
    const out = parseProposeResponse(200, { success: true, batchId: 'b', mode: 'reformat', proposals: [proposal(2, 'aufgefrischt')] });
    expect(out.kind === 'proposals' && out.proposals.length).toBe(1);
  });

  it('reports a poster that already fits as skipped', () => {
    expect(parseProposeResponse(200, { success: true, skipped: 'ratio_ok_poster', ratio: 'ok' })).toEqual({
      kind: 'skipped',
      reason: 'ratio_ok_poster',
    });
  });

  it('maps auth, limit and server errors, keeping the German server message', () => {
    expect(parseProposeResponse(401, { success: false, error: 'Nicht berechtigt' })).toMatchObject({ code: 'unauthorized' });
    expect(parseProposeResponse(429, { success: false, error: 'Tageslimit erreicht.' })).toEqual({
      kind: 'error',
      code: 'limit',
      message: 'Tageslimit erreicht.',
    });
    expect(parseProposeResponse(503, { success: false, error: 'OpenAI-Guthaben aufgebraucht.' })).toMatchObject({
      code: 'unavailable',
    });
    expect(parseProposeResponse(200, { success: true, batchId: 'b', proposals: [] })).toMatchObject({ code: 'bad_response' });
    expect(parseProposeResponse(502, null)).toMatchObject({ code: 'unavailable' });
  });
});

describe('labels', () => {
  it('names directions and variants in German', () => {
    expect(directionLabel('plakativ')).toBe('Plakativ');
    expect(directionLabel('unbekannt')).toBe('unbekannt');
    expect(variantLetter(1)).toBe('A');
    expect(variantLetter(2)).toBe('B');
  });
});
