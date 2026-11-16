import {
  agentAvatarSpec,
  agentRoleLine,
  agentSince,
  agentSubtitle,
  cleanAgentName,
  normalizeAgentView,
  personalityTitle,
  sortRoster,
  type AgentSummary,
} from '../agents';
import type { ChatBot } from '../types';

const agent = (over: Partial<AgentSummary>): AgentSummary => ({
  botId: 'b1', name: 'Mecky', characterId: null, role: 'Dein Assistent', isMain: false, isPreset: true,
  personality: 'standard', since: '2026-11-13T10:00:00Z', ...over,
});

describe('normalizeAgentView', () => {
  it('rejects an unusable response', () => {
    expect(normalizeAgentView(null)).toBeNull();
    expect(normalizeAgentView({})).toBeNull();
    expect(normalizeAgentView({ agent: {} as never })).toBeNull();
  });

  it('fills missing fields', () => {
    const view = normalizeAgentView({ agent: { botId: 'b1', name: 'Mecky' } as never });
    expect(view).not.toBeNull();
    expect(view?.agents).toEqual([]);
    expect(view?.personalities).toEqual([]);
    expect(view?.agent.defaultName).toBe('Mecky');
    expect(view?.agent.customInstructions).toBe('');
    expect(view?.agent.personality).toBe('standard');
    expect(view?.agent.tools).toEqual([]);
  });

  it('drops broken roster entries', () => {
    const view = normalizeAgentView({
      agent: { botId: 'b1', name: 'Mecky' } as never,
      agents: [agent({}), null as never, { name: 'x' } as never],
    });
    expect(view?.agents.map((a) => a.botId)).toEqual(['b1']);
  });
});

describe('roster helpers', () => {
  it('puts the main assistant first and keeps the rest in order', () => {
    const list = [agent({ botId: 'a' }), agent({ botId: 'b' }), agent({ botId: 'c', isMain: true }), agent({ botId: 'd' })];
    expect(sortRoster(list).map((a) => a.botId)).toEqual(['c', 'a', 'b', 'd']);
    expect(list.map((a) => a.botId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('labels the rows', () => {
    expect(agentSubtitle(agent({ isMain: true, characterId: 'otto' }))).toBe('Hauptassistent');
    expect(agentSubtitle(agent({ characterId: 'ida' }))).toBe('Agentin für Nachbarschaftshilfe und Fürsorge');
    expect(agentSubtitle(agent({ role: '' }))).toBe('Assistent');
    expect(agentRoleLine(agent({ isMain: true, characterId: 'otto' }))).toBe('Agent für den Marktplatz und lokale Geschäfte');
    expect(agentRoleLine(agent({}))).toBe('Dein Assistent');
    expect(agentRoleLine(agent({ characterId: 'berta', role: '' }))).toBe('Assistent');
  });

  it('finds a personality title', () => {
    const list = [{ key: 'direkt', title: 'Direkt', description: '' }];
    expect(personalityTitle(list, 'direkt')).toBe('Direkt');
    expect(personalityTitle(list, 'x')).toBe('');
    expect(personalityTitle(list, null)).toBe('');
  });

  it('formats "seit"', () => {
    expect(agentSince('2026-11-13T10:00:00Z')).toMatch(/^seit 13\. Nov\.? 2026$/);
    expect(agentSince('')).toBe('');
    expect(agentSince('nope')).toBe('');
    expect(agentSince(null)).toBe('');
  });

  it('cleans a typed name', () => {
    expect(cleanAgentName('  Otti   der  Zweite ')).toBe('Otti der Zweite');
    expect(cleanAgentName('x'.repeat(50))).toHaveLength(30);
    expect(cleanAgentName('   ')).toBe('');
  });
});

describe('agentAvatarSpec', () => {
  const bot = (over: Partial<ChatBot>): ChatBot => ({
    id: 'b1', name: 'Mecky', description: '', avatar: { shape: 'cloud', color: '#111111', eyes: 'happy' }, isPreset: true,
    modelRoute: 'bot', ...over,
  });

  it('uses the bot avatar for an agent without a character', () => {
    expect(agentAvatarSpec(agent({}), [bot({})])).toEqual({ shape: 'cloud', color: '#111111', eyes: 'happy' });
  });

  it('falls back to the default avatar when the bot is unknown', () => {
    expect(agentAvatarSpec(agent({ botId: 'zz' }), [bot({})])).toEqual({ shape: 'circle', color: '#000000', eyes: 'dots' });
  });

  it('carries the character even when the bootstrap does not know the bot yet', () => {
    expect(agentAvatarSpec(agent({ botId: 'zz', characterId: 'otto' }), [])).toEqual({
      shape: 'circle', eyes: 'dots', color: '#AFD6D2', character: 'otto',
    });
  });

  it('ignores an unknown character id', () => {
    expect(agentAvatarSpec(agent({ characterId: 'berta' }), [bot({})]).character).toBeUndefined();
  });
});
