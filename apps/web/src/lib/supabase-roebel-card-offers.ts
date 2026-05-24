import { createClient } from "@/lib/supabase/client";

export type OfferKind =
  | "percent_discount"
  | "fixed_discount"
  | "free_item_at_threshold"
  | "other";

export interface RoebelCardOfferRow {
  id: string;
  partner_id: string;
  title: string;
  description: string | null;
  kind: OfferKind;
  value_bps: number | null;
  threshold_cents: number | null;
  free_item: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchOffersByPartner(
  partnerId: string,
): Promise<RoebelCardOfferRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roebel_card_offers")
    .select("*")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchOffersByPartner error:", error);
    return [];
  }
  return (data ?? []) as RoebelCardOfferRow[];
}
