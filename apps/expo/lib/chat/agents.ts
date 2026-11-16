// The person's agents (roster): contract of GET /api/chat/agent and pure helpers for the agent screens.
import { characterById, characterRoleLine } from './characters';
import type { BotAvatarSpec, ChatBot } from './types';

/** One roster entry (`agents[]` of GET /api/chat/agent). */
export interface AgentSummary {
  botId: string;
  name: string;
  characterId: string | null;
  /** "Agentin für …" for a character, the bot description otherwise. */
  role: string;
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

/** Tolerates a partial or older response: never throws, always arrays. */
export function normalizeAgentView(raw: Partial<AgentView> | null | undefined): AgentView | null {
  if (!raw || typeof raw !== 'object' || !raw.agent || typeof raw.agent.botId !== 'string') return null;
  const agent = raw.agent;
  return {
    agents: Array.isArray(raw.agents) ? raw.agents.filter((a) => a && typeof a.botId === 'string') : [],
    agent: {
      botId: agent.botId,
      name: agent.name ?? '',
      defaultName: agent.defaultName ?? agent.name ?? '',
      description: agent.description ?? '',
      characterId: agent.characterId ?? null,
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

const DEFAULT_ASSISTANT_AVATAR: BotAvatarSpec = { shape: 'circle', color: '#000000', eyes: 'dots' };

/**
 * Avatar of a roster entry: the bot's own avatar when the bootstrap knows it, else the character's
 * (art + colour), else the plain default.
 */
export function agentAvatarSpec(agent: Pick<AgentSummary, 'botId' | 'characterId'>, bots: ChatBot[]): BotAvatarSpec {
  const bot = bots.find((b) => b.id === agent.botId);
  const c = characterById(agent.characterId);
  if (c) return { shape: 'circle', eyes: 'dots', ...(bot?.avatar ?? {}), color: c.color, character: c.id };
  return bot?.avatar ?? DEFAULT_ASSISTANT_AVATAR;
}
