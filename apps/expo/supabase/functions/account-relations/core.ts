// Pure helpers for the account-relations edge function. No Deno imports: Jest loads this file.
export const MAX_TARGETS = 1000;
export const SOURCES = ['onboarding', 'manual', 'intro'] as const;
export type FollowSource = (typeof SOURCES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Fail = { ok: false; message: string };

function parseIds(raw: unknown): { ok: true; ids: string[] } | Fail {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, message: 'targets required' };
  if (raw.length > MAX_TARGETS) return { ok: false, message: `max ${MAX_TARGETS} targets` };
  const ids: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string' || !UUID_RE.test(t)) return { ok: false, message: 'target malformed' };
    const id = t.toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return { ok: true, ids };
}

export function parseFollowPayload(p: Record<string, unknown>):
  { ok: true; targets: string[]; source: FollowSource } | Fail {
  const ids = parseIds(p.targets);
  if (!ids.ok) return ids;
  if (!(SOURCES as readonly unknown[]).includes(p.source)) return { ok: false, message: 'source invalid' };
  return { ok: true, targets: ids.ids, source: p.source as FollowSource };
}

export function parseUnfollowPayload(p: Record<string, unknown>): { ok: true; targets: string[] } | Fail {
  const ids = parseIds(p.targets);
  return ids.ok ? { ok: true, targets: ids.ids } : ids;
}

export function parseTargetPayload(p: Record<string, unknown>): { ok: true; target: string } | Fail {
  if (typeof p.target !== 'string' || !UUID_RE.test(p.target)) return { ok: false, message: 'target malformed' };
  return { ok: true, target: p.target.toLowerCase() };
}

export function followNotice(a: { followerName: string; source: FollowSource; orgName: string | null }):
  { title: string; body: string } {
  if (a.orgName) return { title: `${a.followerName} folgt jetzt ${a.orgName}`, body: '' };
  if (a.source === 'manual') return { title: `${a.followerName} folgt dir jetzt`, body: '' };
  return { title: `Neu in Röbel: ${a.followerName} folgt dir`, body: 'Sag doch Hallo!' };
}
