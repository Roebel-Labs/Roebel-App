// The person's agents (roster): contract of GET /api/chat/agent and pure helpers for the agent screens.
import { characterById, characterRoleLine } from './characters';
import { FALLBACK_TILE_COLOR, MECKY_AVATAR_SPEC } from './avatar-picture';
import type { BotAvatarSpec, ChatBot } from './types';

/** One roster entry (`agents[]` of GET /api/chat/agent). */
export interface AgentSummary {
  botId: string;
  name: string;
  characterId: string | null;
  /** Own uploaded picture (agents without a character); null otherwise. */
  imageUrl: string | null;
  /** "Agentin für …" for a character, the bot description otherwise. */
  role: string;
  /** How the agent should work (own bots only; null for presets). */
  instructions: string | null;
  isMain: boolean;
  isPreset: boolean;
  personality: string;
  since: string;
}

export interface AgentPersonality {
  key: string;
  title: string;
  description: string;
}

/** The main assistant's profile (`agent` of GET /api/chat/agent); only the fields the app uses. */
export interface AgentProfile {
  botId: string;
  name: string;
  defaultName: string;
  description: string;
  characterId: string | null;
  imageUrl: string | null;
  isPreset: boolean;
  since: string;
  personality: string;
  customInstructions: string;
  tools: string[];
}

export interface AgentView {
  agents: AgentSummary[];
  agent: AgentProfile;
  personalities: AgentPersonality[];
}

export const MAX_AGENT_NAME = 30;
export const MAX_AGENT_INSTRUCTIONS = 4000;
/** "Wofür ist dein Agent da?" (own-picture agents). */
export const MAX_AGENT_ROLE = 120;

/** What an agent looks like: an illustrated character, an own picture, or neither (older bots, presets). */
export type AgentLook = 'character' | 'picture' | 'none';

export function agentLook(agent: Pick<AgentSummary, 'characterId' | 'imageUrl'>): AgentLook {
  if (characterById(agent.characterId)) return 'character';
  return agent.imageUrl ? 'picture' : 'none';
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function normalizeSummary(a: AgentSummary): AgentSummary {
  return {
    ...a,
    name: str(a.name) ?? '',
    characterId: str(a.characterId),
    imageUrl: str(a.imageUrl) || null,
    role: str(a.role) ?? '',
    instructions: str(a.instructions),
    isMain: Boolean(a.isMain),
    isPreset: Boolean(a.isPreset),
    personality: str(a.personality) ?? 'standard',
    since: str(a.since) ?? '',
  };
}

/** Tolerates a partial or older response: never throws, always arrays. */
export function normalizeAgentView(raw: Partial<AgentView> | null | undefined): AgentView | null {
  if (!raw || typeof raw !== 'object' || !raw.agent || typeof raw.agent.botId !== 'string') return null;
  const agent = raw.agent;
  return {
    agents: Array.isArray(raw.agents) ? raw.agents.filter((a) => a && typeof a.botId === 'string').map(normalizeSummary) : [],
    agent: {
      botId: agent.botId,
      name: agent.name ?? '',
      defaultName: agent.defaultName ?? agent.name ?? '',
      description: agent.description ?? '',
      characterId: agent.characterId ?? null,
      imageUrl: str(agent.imageUrl) || null,
      isPreset: Boolean(agent.isPreset),
      since: agent.since ?? '',
      personality: agent.personality ?? 'standard',
      customInstructions: agent.customInstructions ?? '',
      tools: Array.isArray(agent.tools) ? agent.tools : [],
    },
    personalities: Array.isArray(raw.personalities) ? raw.personalities.filter((p) => p && typeof p.key === 'string') : [],
  };
}

/** Roster order: main assistant first, then the server's order (default assistant, then by creation). */
export function sortRoster(agents: AgentSummary[]): AgentSummary[] {
  return agents
    .map((a, i) => ({ a, i }))
    .sort((x, y) => Number(y.a.isMain) - Number(x.a.isMain) || x.i - y.i)
    .map((x) => x.a);
}

/** Second line of a roster row: "Hauptassistent", else the character's role line, else the server's role. */
export function agentSubtitle(agent: Pick<AgentSummary, 'isMain' | 'characterId' | 'role'>): string {
  if (agent.isMain) return 'Hauptassistent';
  const c = characterById(agent.characterId);
  return c ? characterRoleLine(c) : agent.role || 'Assistent';
}

/** What the agent is for: the character's role line, else the server's role text. */
export function agentRoleLine(agent: Pick<AgentSummary, 'characterId' | 'role'>): string {
  const c = characterById(agent.characterId);
  return c ? characterRoleLine(c) : agent.role || 'Assistent';
}

export function personalityTitle(personalities: AgentPersonality[], key: string | null | undefined): string {
  return personalities.find((p) => p.key === key)?.title ?? '';
}

/** "seit 13. Nov. 2026", empty when the date is missing or invalid. */
export function agentSince(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `seit ${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** Trims and caps a name the person typed. */
export function cleanAgentName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_AGENT_NAME);
}

/**
 * Avatar of a roster entry. The roster is fresher than the bootstrap: its character or own picture wins,
 * then the bot's own avatar from the bootstrap, then Mecky's picture for the default assistant, then a
 * plain initial tile. Render it with the agent's name (BotAvatar `name`) for the letter.
 */
export function agentAvatarSpec(
  agent: Pick<AgentSummary, 'botId' | 'characterId'> & Partial<Pick<AgentSummary, 'imageUrl' | 'isPreset'>>,
  bots: ChatBot[],
): BotAvatarSpec {
  const bot = bots.find((b) => b.id === agent.botId);
  const c = characterById(agent.characterId);
  const base: BotAvatarSpec = bot?.avatar ?? { shape: 'circle', eyes: 'dots', color: FALLBACK_TILE_COLOR };
  if (c) {
    const { imageUrl: _ignored, ...rest } = base;
    return { ...rest, color: c.color, character: c.id };
  }
  if (agent.imageUrl) {
    const { character: _ignored, ...rest } = base;
    return { ...rest, imageUrl: agent.imageUrl };
  }
  if (bot) return bot.avatar;
  return agent.isPreset ? MECKY_AVATAR_SPEC : base;
}
