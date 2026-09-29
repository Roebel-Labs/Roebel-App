import {
  supabaseContentMarkdown,
  needsIrysFallback,
  pickProposalTitle,
  pickProposalBody,
} from '../proposal-display';

describe('supabaseContentMarkdown', () => {
  it('returns the markdown from the jsonb content column', () => {
    expect(supabaseContentMarkdown({ version: 1, markdown: '<p>150 €</p>' })).toBe('<p>150 €</p>');
  });

  it('returns null for missing, malformed or blank content', () => {
    expect(supabaseContentMarkdown(null)).toBeNull();
    expect(supabaseContentMarkdown(undefined)).toBeNull();
    expect(supabaseContentMarkdown('<p>x</p>')).toBeNull();
    expect(supabaseContentMarkdown({})).toBeNull();
    expect(supabaseContentMarkdown({ markdown: '' })).toBeNull();
    expect(supabaseContentMarkdown({ markdown: '   \n' })).toBeNull();
    expect(supabaseContentMarkdown({ markdown: 42 })).toBeNull();
  });
});

describe('needsIrysFallback', () => {
  it('skips Irys when Supabase has a body', () => {
    expect(needsIrysFallback('<p>Text</p>')).toBe(false);
  });

  it('falls back to Irys when the Supabase body is missing or empty', () => {
    expect(needsIrysFallback(null)).toBe(true);
    expect(needsIrysFallback(undefined)).toBe(true);
    expect(needsIrysFallback('')).toBe(true);
    expect(needsIrysFallback('  ')).toBe(true);
  });
});

describe('pickProposalBody', () => {
  it('prefers the Supabase body over Irys (admin correction wins)', () => {
    expect(
      pickProposalBody({
        contentMarkdown: '<p>150 € spenden</p>',
        irysMarkdown: '<p>100 € spenden</p>',
        summary: 'summary',
        description: 'desc',
      }),
    ).toBe('<p>150 € spenden</p>');
  });

  it('falls back to Irys when the Supabase body is missing or empty', () => {
    expect(pickProposalBody({ contentMarkdown: null, irysMarkdown: '<p>irys</p>', summary: 's' })).toBe('<p>irys</p>');
    expect(pickProposalBody({ contentMarkdown: '  ', irysMarkdown: '<p>irys</p>', summary: 's' })).toBe('<p>irys</p>');
  });

  it('falls back to summary, then description, then empty', () => {
    expect(pickProposalBody({ irysMarkdown: '', summary: 'sum', description: 'desc' })).toBe('sum');
    expect(pickProposalBody({ summary: ' ', description: 'desc' })).toBe('desc');
    expect(pickProposalBody({})).toBe('');
  });
});

describe('pickProposalTitle', () => {
  it('uses the Supabase title first', () => {
    expect(pickProposalTitle({ title: '150 € Spende', summary: 's', description: 'd' })).toBe('150 € Spende');
  });

  it('falls back to summary, then description, then empty', () => {
    expect(pickProposalTitle({ title: '', summary: 'sum', description: 'd' })).toBe('sum');
    expect(pickProposalTitle({ title: '  ', summary: null, description: 'd' })).toBe('d');
    expect(pickProposalTitle({})).toBe('');
  });
});
