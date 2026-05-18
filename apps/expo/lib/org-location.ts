import type { Account, MemberWithProfile, BusinessRecord, RestaurantRecord } from './types';
import { fetchRestaurantByAccount } from './supabase-restaurants';
import { fetchBusinessesByOwner } from './supabase-businesses';

export type OrgLocation = {
  lat: number;
  lon: number;
  address: string | null;
  entityType: 'restaurant' | 'business';
  entityId: string;
  slug: string | null;
  restaurant?: RestaurantRecord;
  business?: BusinessRecord;
};

/**
 * Try to resolve a map-displayable location for an organisation account.
 * - sub_type === 'restaurant': uses the restaurants row linked by account_id.
 * - other org types: walks the owner-role members and returns the first business
 *   (by owner wallet) that has coordinates.
 * - returns null if no coordinates are available.
 */
export async function resolveOrgLocation(
  account: Account,
  members: MemberWithProfile[]
): Promise<OrgLocation | null> {
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
      (b) => b.latitude != null && b.longitude != null && b.status !== 'rejected'
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
