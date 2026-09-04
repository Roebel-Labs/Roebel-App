import {
  assembleRadioBundle,
  isoWeekKey,
  localDateKey,
  pickLatestPerScope,
  type RadioSegmentRow,
} from '@/lib/event-radio-select';

const row = (p: Partial<RadioSegmentRow> & Pick<RadioSegmentRow, 'kind' | 'scope_key'>): RadioSegmentRow => ({
  audio_url: `https://x/${p.kind}-${p.scope_key}.mp3`,
  duration_ms: 20000,
  created_at: '2026-09-04T04:00:00+00:00',
  ...p,
});

describe('event radio selection', () => {
  it('localDateKey formats the device-local date', () => {
    expect(localDateKey(new Date(2026, 8, 4, 23, 30))).toBe('2026-09-04');
    expect(localDateKey(new Date(2026, 0, 5, 1, 0))).toBe('2026-01-05');
  });

  it('isoWeekKey matches the web helper', () => {
    expect(isoWeekKey('2026-09-04')).toBe('2026-W36');
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
  });

  it('pickLatestPerScope keeps the newest row per scope', () => {
    const latest = pickLatestPerScope([
      row({ kind: 'event', scope_key: 'a', created_at: '2026-09-01T00:00:00Z', audio_url: 'old' }),
      row({ kind: 'event', scope_key: 'a', created_at: '2026-09-03T00:00:00Z', audio_url: 'new' }),
    ]);
    expect(latest.get('event:a')?.audio_url).toBe('new');
  });

  it('assembleRadioBundle maps intro, outro and events for the current day and week', () => {
    const bundle = assembleRadioBundle(
      [
        row({ kind: 'intro', scope_key: '2026-09-04' }),
        row({ kind: 'intro', scope_key: '2026-09-03', audio_url: 'yesterday' }),
        row({ kind: 'outro', scope_key: '2026-W36' }),
        row({ kind: 'event', scope_key: 'a' }),
        row({ kind: 'event', scope_key: 'z', audio_url: 'not-this-week' }),
      ],
      ['a', 'b'],
      '2026-09-04',
      '2026-W36',
    );
    expect(bundle.enabled).toBe(true);
    expect(bundle.intro?.audioUrl).toBe('https://x/intro-2026-09-04.mp3');
    expect(bundle.outro?.durationMs).toBe(20000);
    expect(Object.keys(bundle.byEventId)).toEqual(['a']);
  });

  it('assembleRadioBundle yields nulls when nothing matches', () => {
    const bundle = assembleRadioBundle([], ['a'], '2026-09-04', '2026-W36');
    expect(bundle.intro).toBeNull();
    expect(bundle.outro).toBeNull();
    expect(bundle.byEventId).toEqual({});
  });
});
