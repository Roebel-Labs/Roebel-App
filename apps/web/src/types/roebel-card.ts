// Röbel Card types — points, tiers, stamps, and partner system

export type RoebelTier = "besucher" | "burger" | "supporter";

export type PointsAction =
  | "vote"
  | "event_attend"
  | "post"
  | "checkpoint"
  | "volunteer"
  | "referral"
  | "daily_open"
  | "first_purchase"
  | "verify_citizen"
  | "stamp"
  | "redeem";

export interface PointsLedgerEntry {
  id: string;
  wallet_address: string;
  amount: number; // positive = earn, negative = spend
  action: PointsAction;
  reference_type?: string;
  reference_id?: string;
  description: string;
  created_at: string;
}

export interface RoebelCard {
  wallet_address: string;
  points_balance: number;
  total_earned: number;
  total_spent: number;
  tier: RoebelTier;
  streak_days: number;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StampCard {
  id: string;
  wallet_address: string;
  partner_id: string;
  stamps_collected: number;
  stamps_required: number;
  reward_description: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  // Joined fields
  business_name?: string;
  business_logo_url?: string | null;
}

export interface RoebelCardPartner {
  id: string;
  business_id: string;
  is_active: boolean;
  offer_type: "stamp_card" | "points_multiplier" | "exclusive_access" | "priority_booking" | "custom";
  offer_config: Record<string, unknown>;
  total_redemptions: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  business_name?: string;
  business_logo_url?: string | null;
}

// Points earning rules
export const POINTS_RULES: Record<PointsAction, { amount: number; label: string; cap?: string }> = {
  vote: { amount: 50, label: "Abstimmung", cap: "Pro Vorschlag" },
  event_attend: { amount: 30, label: "Event besucht", cap: "Pro Event" },
  post: { amount: 10, label: "Beitrag erstellt", cap: "5/Tag" },
  checkpoint: { amount: 25, label: "Checkpoint besucht", cap: "Pro Checkpoint" },
  volunteer: { amount: 100, label: "Ehrenamt", cap: "Pro Event" },
  referral: { amount: 200, label: "Empfehlung", cap: "Unbegrenzt" },
  daily_open: { amount: 5, label: "Tägliches Öffnen", cap: "1/Tag" },
  first_purchase: { amount: 50, label: "Erster Einkauf", cap: "Pro Partner" },
  verify_citizen: { amount: 75, label: "Bürger verifiziert", cap: "Pro Verifizierung" },
  stamp: { amount: 10, label: "Stempel gesammelt", cap: "1/Gewerbe/Tag" },
  redeem: { amount: 0, label: "Eingelöst", cap: "" },
};

// Tier thresholds
export const TIER_THRESHOLDS: Record<RoebelTier, { minPoints: number; label: string; description: string }> = {
  besucher: { minPoints: 0, label: "Besucher", description: "Karte, Events, Basis-Angebote, Mecky Guide" },
  burger: { minPoints: 100, label: "Bürger", description: "Marktplatz, Abstimmungen, alle Angebote, Nachrichten" },
  supporter: { minPoints: 1000, label: "Supporter", description: "Premium-Buchung, exklusive Events, Punkte-Multiplikator" },
};
