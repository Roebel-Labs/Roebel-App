import { buildCalendarContext, CALENDAR_CONTEXT_MAX, formatEventWhen, isCalendarThread, withPartStatus } from '../calendar';
import type { ChatMessage } from '../types';

// Local-time dates so the assertions hold in any TZ the test runs in.
const NOW = new Date(2026, 8, 26, 8, 0); // Sa 26.09.2026 08:00
const local = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m);

describe('buildCalendarContext', () => {
  it('keeps the next 7 days, sorted, with only title/start/end/location', () => {
    const out = buildCalendarContext(
      [
        { title: 'B', startDate: local(27, 9), endDate: local(27, 10) },
        { title: '  A  ', startDate: local(26, 10).toISOString(), endDate: local(26, 10, 30).toISOString(), location: 'Markt 1' },
        { title: 'running', startDate: local(26, 7), endDate: local(26, 9) },
        { title: 'past', startDate: local(25, 9), endDate: local(25, 10) },
        { title: 'far', startDate: local(3 + 30, 9), endDate: local(3 + 30, 10) },
        { title: 'broken', startDate: 'nope', endDate: local(27, 10) },
        { title: null, startDate: local(28, 9), endDate: local(28, 10), location: '  ' },
      ],
      NOW,
    );
    expect(out.map((e) => e.title)).toEqual(['running', 'A', 'B', '(ohne Titel)']);
    expect(out[1]).toEqual({
      title: 'A',
      start: local(26, 10).toISOString(),
      end: local(26, 10, 30).toISOString(),
      location: 'Markt 1',
    });
    expect(out[3].location).toBeUndefined();
  });

  it('caps at 50 events', () => {
    const many = Array.from({ length: 70 }, (_, i) => ({
      title: `E${i}`,
      startDate: new Date(NOW.getTime() + (i + 1) * 3_600_000),
      endDate: new Date(NOW.getTime() + (i + 2) * 3_600_000),
    }));
    const out = buildCalendarContext(many, NOW);
    expect(out).toHaveLength(CALENDAR_CONTEXT_MAX);
    expect(out[0].title).toBe('E0');
  });
});

describe('formatEventWhen', () => {
  it('formats same-day, all-day and multi-day spans', () => {
    expect(formatEventWhen(local(26, 10).toISOString(), local(26, 10, 30).toISOString())).toBe('Sa, 26.09. · 10:00–10:30');
    expect(formatEventWhen(local(26, 0).toISOString(), local(27, 0).toISOString())).toBe('Sa, 26.09. · ganztägig');
    expect(formatEventWhen(local(26, 22).toISOString(), local(27, 1).toISOString())).toBe('Sa, 26.09. · 22:00 – So, 27.09. 01:00');
  });
});

describe('isCalendarThread', () => {
  const bot = (tools?: string[]) => ({
    id: 'b',
    name: 'B',
    description: '',
    avatar: { shape: 'circle' as const, color: '#000', eyes: 'dots' as const },
    isPreset: true,
    modelRoute: 'bot-fast',
    tools,
  });
  it('detects the calendar tool on any bot', () => {
    expect(isCalendarThread({ bots: [bot(['files']), bot(['calendar'])] })).toBe(true);
    expect(isCalendarThread({ bots: [bot(['files']), bot()] })).toBe(false);
    expect(isCalendarThread(null)).toBe(false);
  });
});

describe('withPartStatus', () => {
  const msg: ChatMessage = {
    id: 'm1',
    threadId: 't1',
    role: 'bot',
    botId: 'b1',
    parts: [
      { type: 'text', text: 'Hier ein Vorschlag' },
      { type: 'calendar_event', title: 'Lauftreff', start: '2026-09-27T07:00:00Z', end: '2026-09-27T08:00:00Z', status: 'proposed' },
      { type: 'integration', provider: 'device_calendar', title: 'Kalender', description: 'd', status: 'pending' },
    ],
    replyTo: null,
    reactions: {},
    createdAt: '2026-09-26T06:00:00Z',
  };

  it('sets calendar_event status immutably', () => {
    const next = withPartStatus(msg, 1, 'added');
    expect(next).not.toBe(msg);
    expect(next.parts[1]).toMatchObject({ type: 'calendar_event', status: 'added' });
    expect(msg.parts[1]).toMatchObject({ status: 'proposed' });
    expect(withPartStatus(next, 1, 'dismissed').parts[1]).toMatchObject({ status: 'dismissed' });
  });

  it('sets integration status', () => {
    expect(withPartStatus(msg, 2, 'connected').parts[2]).toMatchObject({ status: 'connected' });
  });

  it('ignores wrong index, wrong type, wrong status and no-ops', () => {
    expect(withPartStatus(msg, 9, 'added')).toBe(msg);
    expect(withPartStatus(msg, 0, 'added')).toBe(msg);
    expect(withPartStatus(msg, 1, 'connected')).toBe(msg);
    expect(withPartStatus(msg, 2, 'added')).toBe(msg);
    expect(withPartStatus(msg, 1, 'proposed')).toBe(msg);
  });
});
