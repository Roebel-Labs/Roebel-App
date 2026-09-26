import { buildMcpHeaders, connectorSubtitle, googleResultFromUrl, isLikelyMcpUrl } from '../connections';
import type { ChatConnector } from '../api';

const base: ChatConnector = {
  id: '1', kind: 'mcp', name: 'Notion', url: 'https://mcp.notion.com/mcp', status: 'active', toolCount: 3, lastError: null,
};

describe('connections helpers', () => {
  it('builds the Authorization header', () => {
    expect(buildMcpHeaders('')).toBeUndefined();
    expect(buildMcpHeaders('  ')).toBeUndefined();
    expect(buildMcpHeaders('abc')).toEqual({ Authorization: 'Bearer abc' });
    expect(buildMcpHeaders('Bearer abc')).toEqual({ Authorization: 'Bearer abc' });
    expect(buildMcpHeaders('Basic dXNlcg==')).toEqual({ Authorization: 'Basic dXNlcg==' });
  });

  it('checks MCP URLs loosely', () => {
    expect(isLikelyMcpUrl('https://mcp.notion.com/mcp')).toBe(true);
    expect(isLikelyMcpUrl('http://mcp.notion.com/mcp')).toBe(false);
    expect(isLikelyMcpUrl('https://localhost')).toBe(false);
    expect(isLikelyMcpUrl('notion')).toBe(false);
  });

  it('reads the Google redirect result', () => {
    expect(googleResultFromUrl('roebel://chat/settings/connections?google=ok')).toBe('ok');
    expect(googleResultFromUrl('exp://x/--/chat/settings/connections?a=1&google=cancelled')).toBe('cancelled');
    expect(googleResultFromUrl('roebel://chat/settings/connections')).toBeNull();
    expect(googleResultFromUrl(null)).toBeNull();
  });

  it('describes a connector', () => {
    expect(connectorSubtitle(base)).toBe('3 Werkzeuge · mcp.notion.com');
    expect(connectorSubtitle({ ...base, toolCount: 1 })).toBe('1 Werkzeug · mcp.notion.com');
    expect(connectorSubtitle({ ...base, status: 'error', lastError: 'Kaputt' })).toBe('Kaputt');
    expect(connectorSubtitle({ ...base, kind: 'google', url: null })).toBe('Gmail, Kalender und Drive');
  });
});
