// apps/web/src/lib/event-radio/plan.ts
// Pure planning: which scopes need a new clip, which rows became stale,
// which rows have expired. generate.ts executes these decisions.
import {
  eventContentHash,
  introContentHash,
  outroContentHash,
  type HashContext,
  type PublicEvent,
} from "./hash";
import { pickLatestPerScope, scopeId, type RadioKind } from "./select";
import { addDays } from "./window";

export type ExistingRow = {
  id: string;
  kind: RadioKind;
  scope_key: string;
  content_hash: string;
  audio_url: string;
  script: string;
  duration_ms: number;
  created_at: string;
  event_date: string | null;
};

export type ScopePlan = {
  kind: RadioKind;
  scopeKey: string;
  hash: string;
  needed: boolean;
  event?: PublicEvent;
};

export function planScopes(input: {
  events: PublicEvent[];
  todayKey: string;
  weekKey: string;
  existing: ExistingRow[];
  ctx: HashContext;
  force: boolean;
}): { intro: ScopePlan | null; outro: ScopePlan; events: ScopePlan[] } {
  const latest = pickLatestPerScope(input.existing);
  const needed = (kind: RadioKind, scopeKey: string, hash: string): boolean =>
    input.force || latest.get(scopeId(kind, scopeKey))?.content_hash !== hash;

  let intro: ScopePlan | null = null;
  if (input.events.length > 0) {
    const hash = introContentHash(input.events, input.todayKey, input.ctx);
    intro = { kind: "intro", scopeKey: input.todayKey, hash, needed: needed("intro", input.todayKey, hash) };
  }

  const outroHash = outroContentHash(input.weekKey, input.ctx);
  const outro: ScopePlan = {
    kind: "outro",
    scopeKey: input.weekKey,
    hash: outroHash,
    needed: needed("outro", input.weekKey, outroHash),
  };

  const events = input.events.map((event): ScopePlan => {
    const hash = eventContentHash(event, input.ctx);
    return { kind: "event", scopeKey: event.id, hash, needed: needed("event", event.id, hash), event };
  });

  return { intro, outro, events };
}

/** Rows of the same scope other than `keepId`; deleted after a new clip lands. */
export function staleRowsForScope(
  existing: ExistingRow[],
  kind: RadioKind,
  scopeKey: string,
  keepId: string,
): ExistingRow[] {
  return existing.filter((r) => r.kind === kind && r.scope_key === scopeKey && r.id !== keepId);
}

/**
 * Spec section 6.5 step 6: intros older than 3 days, outros outside this and
 * last week, events more than 3 days past.
 */
export function planExpiry(input: {
  existing: ExistingRow[];
  todayKey: string;
  weekKey: string;
  previousWeekKey: string;
}): ExistingRow[] {
  const cutoff = addDays(input.todayKey, -3);
  return input.existing.filter((row) => {
    if (row.kind === "intro") return row.scope_key < cutoff;
    if (row.kind === "outro") return row.scope_key !== input.weekKey && row.scope_key !== input.previousWeekKey;
    return typeof row.event_date === "string" && row.event_date < cutoff;
  });
}
