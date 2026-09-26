// Pure helpers for the "Verbindungen" screen (connectors: MCP servers + Google).
import type { ChatConnector } from './api';

/** Headers for a new MCP server from the optional Authorization field (raw tokens get "Bearer "). */
export function buildMcpHeaders(authorization: string): Record<string, string> | undefined {
  const v = authorization.trim();
  if (!v) return undefined;
  return { Authorization: /^(bearer|basic|token)\s+/i.test(v) ? v : `Bearer ${v}` };
}

/** Light client-side URL check before the server's own guard. */
export function isLikelyMcpUrl(raw: string): boolean {
  return /^https:\/\/[^\s/]+\.[^\s/]+(\/\S*)?$/i.test(raw.trim());
}

/** Result of the Google OAuth redirect (…?google=ok|error|cancelled). */
export function googleResultFromUrl(url: string | null | undefined): 'ok' | 'error' | 'cancelled' | null {
  if (!url) return null;
  const m = url.match(/[?&]google=(ok|error|cancelled)\b/);
  return m ? (m[1] as 'ok' | 'error' | 'cancelled') : null;
}

export function connectorSubtitle(c: ChatConnector): string {
  if (c.status === 'error') return c.lastError || 'Verbindung gestört';
  if (c.status === 'disabled') return 'Deaktiviert';
  if (c.kind === 'google') return 'Gmail, Kalender und Drive';
  const tools = c.toolCount === 1 ? '1 Werkzeug' : `${c.toolCount} Werkzeuge`;
  let host = '';
  try {
    host = c.url ? new URL(c.url).host : '';
  } catch {
    host = '';
  }
  return host ? `${tools} · ${host}` : tools;
}
