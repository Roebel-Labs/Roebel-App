// Tenant resolution for the community data layer. Röbel is the only tenant
// today: its rows live in the shared tables without a tenant column, so any
// tenant id resolves to Röbel. The parameter exists so callers are already
// tenant-aware when the next town arrives.
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;

export interface TenantSite {
  id: "roebel";
  /** Public web origin used for deep links. */
  origin: string;
  /** Abfallkalender node id at the Landkreis ICS source. */
  wasteNodeId: number;
}

const ROEBEL: TenantSite = {
  id: "roebel",
  origin: "https://www.roebel.app",
  wasteNodeId: 12236,
};

/** Resolve a tenant id ('roebel'; anything else falls back to Röbel). */
export function tenantSite(_tenantId: string, originOverride?: string): TenantSite {
  return originOverride ? { ...ROEBEL, origin: originOverride.replace(/\/+$/, "") } : ROEBEL;
}

/**
 * Make a free-text query safe for PostgREST `.or()` / `ilike` filters:
 * commas and parentheses would break the filter grammar, % and _ are
 * wildcards.
 */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()%_*\\"]/g, " ").replace(/\s+/g, " ").trim();
}
