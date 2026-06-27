/**
 * Resolve an org account to a physical location (restaurant or business),
 * plus its deals. Ported from apps/expo/lib/org-location.ts.
 */

import { supabase } from "./supabase";
import { fetchRestaurantByAccount } from "./supabase-gastro";
import type { Account, MemberWithProfile } from "@/types/account";
import type { Business, OpeningHours } from "@/types/business";

export interface OrgLocation {
  lat: number | null;
  lon: number | null;
  address: string | null;
  entityType: "restaurant" | "business";
  entityId: string;
  slug: string | null;
  openingHours: OpeningHours | null;
  business?: Business;
}

export interface BusinessDealRecord {
  id: string;
  business_id: string;
  title: string;
  deal_value: string | null;
  image_url: string | null;
  is_active: boolean;
  status: string;
}

function validCoord(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export async function resolveOrgLocation(
  account: Account,
  members: MemberWithProfile[]
): Promise<OrgLocation | null> {
  // Restaurants: location lives on the linked restaurant row.
  if (account.sub_type === "restaurant") {
    const restaurant = await fetchRestaurantByAccount(account.id);
    if (restaurant && (restaurant.address || validCoord(restaurant.latitude))) {
      return {
        lat: restaurant.latitude,
        lon: restaurant.longitude,
        address: restaurant.address,
        entityType: "restaurant",
        entityId: restaurant.id,
        slug: restaurant.slug ?? null,
        openingHours: null,
      };
    }
    return null;
  }

  // Other orgs: resolve via an owner member's business.
  const ownerWallets = members
    .filter((m) => m.role === "owner")
    .map((m) => m.wallet_address.toLowerCase());
  if (ownerWallets.length === 0) return null;

  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .in("owner_wallet_address", ownerWallets);
  if (error) {
    console.error("resolveOrgLocation businesses error:", error);
    return null;
  }

  const business = ((data as Business[]) ?? []).find(
    (b) => b.status !== "rejected" && (b.address || validCoord(b.latitude))
  );
  if (!business) return null;

  return {
    lat: business.latitude,
    lon: business.longitude,
    address: business.address,
    entityType: "business",
    entityId: business.id,
    slug: business.slug ?? null,
    openingHours: business.opening_hours ?? null,
    business,
  };
}

export async function fetchDealsByBusiness(
  businessId: string
): Promise<BusinessDealRecord[]> {
  const { data, error } = await supabase
    .from("business_deals")
    .select("id, business_id, title, deal_value, image_url, is_active, status")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchDealsByBusiness error:", error);
    return [];
  }
  return (data as BusinessDealRecord[]) ?? [];
}
