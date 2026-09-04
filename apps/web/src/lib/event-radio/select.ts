// apps/web/src/lib/event-radio/select.ts
// "Latest wins" per (kind, scope_key). The Expo app carries the same logic
// in apps/expo/lib/event-radio-select.ts; keep the two in sync.

export type RadioKind = "intro" | "event" | "outro";

export type ScopedRow = { kind: RadioKind; scope_key: string; created_at: string };

export function scopeId(kind: RadioKind, scopeKey: string): string {
  return `${kind}:${scopeKey}`;
}

export function pickLatestPerScope<T extends ScopedRow>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) {
    const key = scopeId(row.kind, row.scope_key);
    const current = out.get(key);
    if (!current || Date.parse(row.created_at) > Date.parse(current.created_at)) {
      out.set(key, row);
    }
  }
  return out;
}
