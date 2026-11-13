// Pure helpers of the "Assistent" page and the assistant's display name (tested).
import type { Agent, AgentChannel } from '../workspace/api';

/**
 * The name to show for a bot: the user's own name for the profile's base bot when they changed it,
 * otherwise the bot's name.
 */
export function displayBotName(bot: { id: string; name: string } | null | undefined, agent: Pick<Agent, 'botId' | 'name' | 'defaultName'> | null | undefined, fallback = 'Mecky'): string {
  if (!bot) return agent?.name?.trim() || fallback;
  const own = agent && agent.botId === bot.id ? agent.name.trim() : '';
  return own && own !== agent!.defaultName ? own : bot.name || fallback;
}

/** "mecky.max@ortis.app" → alias "mecky.max", domain "ortis.app". */
export function splitAddress(address: string | null | undefined): { alias: string; domain: string } {
  const a = (address ?? '').trim();
  const at = a.lastIndexOf('@');
  return at > 0 ? { alias: a.slice(0, at), domain: a.slice(at + 1) } : { alias: a, domain: '' };
}

/** What the alias field accepts while typing: lower case, letters, digits, dot, dash, underscore. */
export function cleanAlias(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
}

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Im Internet suchen',
  web_fetch: 'Webseiten lesen',
  files: 'Dateien erstellen und lesen',
  calendar: 'Kalender lesen und Termine vorschlagen',
  mail: 'E-Mails lesen und Entwürfe schreiben',
  memory: 'Sich Dinge über dich merken',
  wiki: 'Dein Wiki lesen und ergänzen',
  connectors: 'Verbundene Dienste nutzen',
  images: 'Bilder erzeugen',
  ask_options: 'Rückfragen mit Auswahl stellen',
  routines: 'Routinen ausführen',
  tasks: 'Aufgaben in Schritten erledigen',
  roebel: 'Röbel App: Veranstaltungen, Orte, Kontakte',
};

/** German label for a tool key; unknown keys are shown as they are. */
export function toolLabel(key: string): string {
  return TOOL_LABELS[key] ?? key;
}

/** A channel of this kind that was not there when the link dialog opened. */
export function newChannel(before: ReadonlyArray<Pick<AgentChannel, 'id'>>, now: ReadonlyArray<AgentChannel>, kind: AgentChannel['kind']): AgentChannel | null {
  const known = new Set(before.map((c) => c.id));
  return now.find((c) => c.kind === kind && !known.has(c.id)) ?? null;
}

export function isExpired(expiresAt: string | null | undefined, nowMs = Date.now()): boolean {
  const t = expiresAt ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(t) && t <= nowMs;
}

export const CHANNEL_LABEL: Record<AgentChannel['kind'], string> = { sms: 'SMS', whatsapp: 'WhatsApp' };
