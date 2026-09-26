import {
  findDirectThread,
  inspirationQuery,
  inspirationRowLabel,
  starterText,
  tierBadgeLabel,
  withoutTask,
  type InspirationFeed,
} from '../inspiration';
import type { ChatBot, ChatThread } from '../types';

const bot = (id: string): ChatBot => ({
  id,
  name: id,
  description: '',
  avatar: { shape: 'circle', color: '#000000', eyes: 'dots' },
  isPreset: true,
  modelRoute: 'bot-smart',
});

const thread = (id: string, bots: string[], lastMessageAt: string, kind: ChatThread['kind'] = 'direct'): ChatThread => ({
  id,
  title: id,
  topic: null,
  kind,
  bots: bots.map(bot),
  lastMessageAt,
  lastMessagePreview: '',
  unread: false,
  lastReadAt: lastMessageAt,
  hasActiveRoutine: false,
});

describe('inspiration helpers', () => {
  it('builds the audience query', () => {
    expect(inspirationQuery(null)).toBe('?audience=me');
    expect(inspirationQuery('me')).toBe('?audience=me');
    expect(inspirationQuery('org:')).toBe('?audience=me');
    expect(inspirationQuery('org:a b')).toBe('?audience=org&orgId=a%20b');
  });

  it('labels tiers', () => {
    expect(tierBadgeLabel('free')).toBeNull();
    expect(tierBadgeLabel('plus')).toBe('Plus');
    expect(tierBadgeLabel('ultra')).toBe('Ultra');
    expect(tierBadgeLabel('business')).toBe('Betrieb');
  });

  it('appends the routine request only when asked and possible', () => {
    const task = { starterPrompt: 'Mach X. ', recurring: { suggestion: 'jeden Montag 7:00' } };
    expect(starterText(task, false)).toBe('Mach X.');
    expect(starterText(task, true)).toBe('Mach X.\n\nRichte das bitte als Routine ein: jeden Montag 7:00.');
    expect(starterText({ starterPrompt: 'Mach Y.' }, true)).toBe('Mach Y.');
  });

  it('finds the newest direct thread with exactly that bot', () => {
    const threads = [
      thread('old', ['m'], '2026-09-01T00:00:00Z'),
      thread('group', ['m', 'r'], '2026-09-25T00:00:00Z', 'group'),
      thread('new', ['m'], '2026-09-20T00:00:00Z'),
      thread('other', ['r'], '2026-09-26T00:00:00Z'),
    ];
    expect(findDirectThread(threads, 'm')?.id).toBe('new');
    expect(findDirectThread(threads, 'x')).toBeNull();
  });

  it('labels the chat list row and drops dismissed cards', () => {
    expect(inspirationRowLabel(0)).toBe('Für dich');
    expect(inspirationRowLabel(1)).toBe('Für dich · 1 Idee');
    expect(inspirationRowLabel(6)).toBe('Für dich · 6 Ideen');
    const feed = { audiences: [], audienceKey: 'me', tier: 'free', tasks: [{ id: 'a' }, { id: 'b' }] } as unknown as InspirationFeed;
    expect(withoutTask(feed, 'a').tasks.map((t) => t.id)).toEqual(['b']);
  });
});
