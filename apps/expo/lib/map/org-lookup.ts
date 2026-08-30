/**
 * Pin → organisation account resolution for the map bottom sheet.
 *
 * Every pin type can stand for an org, and the rich sheet hangs off an
 * `accounts` row:
 *
 *   org pin        → the account itself
 *   restaurant pin → restaurants.account_id (a real FK)
 *   business pin   → matched by name, because businesses carry no account link
 *   event / poi    → no org, today's card
 *
 * The index is built ONCE when map data loads and keyed by the same
 * `"<entityType>-<id>"` fid the GeoJSON features use, so tapping a pin is a
 * map read rather than a query.
 */
import type { Account, BusinessRecord, RestaurantRecord } from '@/lib/types';

export type OrgIndex = {
  /** `"<entityType>-<id>"` → `accounts.id` */
  byPin: Map<string, string>;
  /** `accounts.id` → the account, for bio, hours and avatar */
  byId: Map<string, Account>;
};

export const EMPTY_ORG_INDEX: OrgIndex = { byPin: new Map(), byId: new Map() };

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * True when a business belongs to the org by name — the same name, or the org
 * name extending it at a word boundary ("KABIMA Inhaber Karl Kneile" owns
 * "KABIMA").
 *
 * Deliberately one-directional. The reverse would let an org called "Bistro"
 * claim the unrelated business "Bistro zur Waage", a different place two
 * streets away.
 */
export function belongsToOrg(orgName: string, businessName: string): boolean {
  const org = normalizeName(orgName);
  const biz = normalizeName(businessName);
  return org === biz || org.startsWith(`${biz} `);
}

export function buildOrgIndex(
  orgs: Account[],
  restaurants: RestaurantRecord[],
  businesses: BusinessRecord[]
): OrgIndex {
  const byPin = new Map<string, string>();
  const byId = new Map<string, Account>();

  for (const org of orgs) {
    byId.set(org.id, org);
    byPin.set(`org-${org.id}`, org.id);
  }

  for (const restaurant of restaurants) {
    if (restaurant.account_id) {
      byPin.set(`restaurant-${restaurant.id}`, restaurant.account_id);
    }
  }

  // Businesses have no FK to accounts, so fall back to the name match. Longer
  // org names are tested first: "KABIMA Inhaber Karl Kneile" should win over a
  // bare "KABIMA" org if both ever exist.
  const byNameLength = [...orgs].sort((a, b) => b.name.length - a.name.length);
  for (const business of businesses) {
    const owner = byNameLength.find((org) => belongsToOrg(org.name, business.name));
    if (owner) {
      byPin.set(`business-${business.id}`, owner.id);
    }
  }

  return { byPin, byId };
}

/** `null` for events, POIs, and any place with no org behind it. */
export function accountIdForPin(
  index: OrgIndex,
  entityType: string,
  id: string
): string | null {
  return index.byPin.get(`${entityType}-${id}`) ?? null;
}

/** The resolved account, or `null` when the pin has no org behind it. */
export function orgForPin(
  index: OrgIndex,
  entityType: string,
  id: string
): Account | null {
  const accountId = accountIdForPin(index, entityType, id);
  return accountId ? (index.byId.get(accountId) ?? null) : null;
}
