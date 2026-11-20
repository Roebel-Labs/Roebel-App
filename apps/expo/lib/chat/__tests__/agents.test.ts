import {
  agentAvatarSpec,
  agentRoleLine,
  agentSince,
  agentSubtitle,
  cleanAgentName,
  normalizeAgentView,
  personalityTitle,
  sortRoster,
  agentLook,
  type AgentSummary,
} from '../agents';
import type { ChatBot } from '../types';
import { MECKY_AVATAR_SPEC } from '../avatar-picture';

const agent = (over: Partial<AgentSummary>): AgentSummary => ({
  botId: 'b1', name: 'Mecky', characterId: null, imageUrl: null, role: 'Dein Assistent', instructions: null,
  isMain: false, isPreset: true, personality: 'standard', since: '2026-11-13T10:00:00Z', ...over,
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

  it('falls back to Mecky for an unknown preset and to a plain tile for an unknown own bot', () => {
    expect(agentAvatarSpec(agent({ botId: 'zz' }), [bot({})])).toEqual(MECKY_AVATAR_SPEC);
    expect(agentAvatarSpec(agent({ botId: 'zz', isPreset: false }), [bot({})])).toEqual({
      shape: 'circle', eyes: 'dots', color: '#00498B',
    });
  });

  it('uses the roster picture over the bootstrap avatar and drops a stale character', () => {
    const url = 'https://x.supabase.co/storage/v1/object/public/images/chat/avatars/a.jpg';
    expect(agentAvatarSpec(agent({ imageUrl: url }), [bot({ avatar: { shape: 'circle', color: '#111111', eyes: 'dots', character: 'otto' } })]))
      .toEqual({ shape: 'circle', color: '#111111', eyes: 'dots', imageUrl: url });
  });

  it('drops an old picture once the roster says character', () => {
    const spec = agentAvatarSpec(agent({ characterId: 'otto' }), [bot({ avatar: { shape: 'circle', color: '#111111', eyes: 'dots', imageUrl: 'https://a/b.jpg' } })]);
    expect(spec.imageUrl).toBeUndefined();
    expect(spec.character).toBe('otto');
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

describe('agentLook', () => {
  it('tells character, own picture and neither apart', () => {
    expect(agentLook({ characterId: 'otto', imageUrl: null })).toBe('character');
    expect(agentLook({ characterId: null, imageUrl: 'https://a/b.jpg' })).toBe('picture');
    expect(agentLook({ characterId: null, imageUrl: null })).toBe('none');
    expect(agentLook({ characterId: 'berta', imageUrl: null })).toBe('none');
  });
});

describe('normalizeAgentView roster fields', () => {
  it('fills imageUrl and instructions on older responses', () => {
    const view = normalizeAgentView({
      agent: { botId: 'b1', name: 'Mecky' } as never,
      agents: [{ botId: 'b2', name: 'Kochi', characterId: null, role: 'Kochen' } as never],
    });
    expect(view?.agents[0].imageUrl).toBeNull();
    expect(view?.agents[0].instructions).toBeNull();
    expect(view?.agent.imageUrl).toBeNull();
  });
});
