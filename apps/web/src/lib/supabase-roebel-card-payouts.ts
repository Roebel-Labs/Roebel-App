import { createClient } from "@/lib/supabase/client";

export type PayoutStatus = "pending" | "sent" | "failed";

export interface RoebelCardPayoutRow {
  id: string;
  partner_id: string;
  amount_cents: number;
  period_start: string;
  period_end: string;
  status: PayoutStatus;
  stripe_payout_id: string | null;
  reference: string | null;
  initiated_at: string;
  sent_at: string | null;
}

export async function fetchPayoutsByPartner(
  partnerId: string,
): Promise<RoebelCardPayoutRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("roebel_card_payouts")
    .select("*")
    .eq("partner_id", partnerId)
    .order("initiated_at", { ascending: false });

  if (error) {
    console.error("fetchPayoutsByPartner error:", error);
    return [];
  }
  return (data ?? []) as RoebelCardPayoutRow[];
}
