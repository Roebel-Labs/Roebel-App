import type { Account, MemberWithProfile, BusinessRecord, RestaurantRecord } from './types';
import { fetchRestaurantByAccount } from './supabase-restaurants';
import { fetchBusinessesByOwner } from './supabase-businesses';

export type OrgLocation = {
  lat: number;
  lon: number;
  address: string | null;
  entityType: 'restaurant' | 'business' | 'org';
  entityId: string;
  slug: string | null;
  restaurant?: RestaurantRecord;
  business?: BusinessRecord;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * True when a business belongs to the org by name — either the exact same name,
 * or the org name extends it at a word boundary ("KABIMA Inhaber Karl Kneile"
 * owns "KABIMA"). Deliberately one-directional: an org called "Bistro" must NOT
 * claim a business called "Bistro zur Waage".
 */
function belongsToOrg(orgName: string, businessName: string): boolean {
  const org = normalizeName(orgName);
  const biz = normalizeName(businessName);
  return org === biz || org.startsWith(`${biz} `);
}

/**
 * Try to resolve a map-displayable location for an organisation account.
 * - the account's own coordinates win (Vereine, Fraktionen, die Stadt).
 * - sub_type === 'restaurant': uses the restaurants row linked by account_id.
 * - other org types: walks the owner-role members and returns a business that
 *   has coordinates AND actually belongs to this org by name.
 * - returns null if no coordinates are available.
 *
 * The name check matters: several orgs share one admin wallet, so an unfiltered
 * owner walk used to hand "Stadt Röbel" whichever business that wallet happened
 * to own — and with it that business's deals and opening hours.
 */
export async function resolveOrgLocation(
  account: Account,
  members: MemberWithProfile[]
): Promise<OrgLocation | null> {
  if (account.latitude != null && account.longitude != null) {
    return {
      lat: account.latitude,
      lon: account.longitude,
      address: account.address,
      entityType: 'org',
      entityId: account.id,
      slug: account.slug,
    };
  }

  if (account.sub_type === 'restaurant') {
    const restaurant = await fetchRestaurantByAccount(account.id);
    if (restaurant && restaurant.latitude != null && restaurant.longitude != null) {
      return {
        lat: restaurant.latitude,
        lon: restaurant.longitude,
        address: restaurant.address,
        entityType: 'restaurant',
        entityId: restaurant.id,
        slug: restaurant.slug,
        restaurant,
      };
    }
    return null;
  }

  const owners = members.filter((m) => m.role === 'owner');
  for (const owner of owners) {
    const businesses = await fetchBusinessesByOwner(owner.wallet_address);
    const located = businesses.find(
      (b) =>
        b.latitude != null &&
        b.longitude != null &&
        b.status !== 'rejected' &&
        belongsToOrg(account.name, b.name)
    );
    if (located) {
      return {
        lat: located.latitude!,
        lon: located.longitude!,
        address: located.address,
        entityType: 'business',
        entityId: located.id,
        slug: located.slug,
        business: located,
      };
    }
  }

  return null;
}
