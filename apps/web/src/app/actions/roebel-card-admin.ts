"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  OverviewStats,
  PurchaseFilters,
  PurchaseWithRelations,
  RoebelCardPurchaseRow,
  RoebelVereinContributionRow,
  RoebelVereinFundRow,
  RoebelVereinFundEntryRow,
  VereineContributionWithAccount,
} from "@/types/roebel-card-voucher";

// Server actions for the Röbel Card admin dashboard (voucher system).
//
// Uses the service-role client because the new voucher tables have
// default-deny RLS on writes and the admin dashboard is already gated
// by the session middleware at /admin/*.

export interface ListPurchasesResult {
  purchases: PurchaseWithRelations[];
  totalCount: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 50;

export async function listRoebelCardPurchases(
  filters: PurchaseFilters = {},
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<ListPurchasesResult> {
  const supabase = createAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("roebel_card_purchases")
    .select(
      `id, card_id, amount_cents, fee_cents, beneficiary_account_id,
       purchaser_wallet_address, is_sachbezug, employer_account_id,
       stripe_session_id, stripe_payment_intent_id, status, created_at, paid_at,
       roebel_card:roebel_card!card_id ( wallet_address ),
       beneficiary:accounts!beneficiary_account_id ( name )`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (
    filters.beneficiaryAccountId &&
    filters.beneficiaryAccountId !== "all"
  ) {
    if (filters.beneficiaryAccountId === "topf") {
      query = query.is("beneficiary_account_id", null);
    } else {
      query = query.eq("beneficiary_account_id", filters.beneficiaryAccountId);
    }
  }
  if (filters.walletSearch) {
    query = query.ilike("purchaser_wallet_address", `%${filters.walletSearch}%`);
  }
  if (filters.from) {
    query = query.gte("created_at", filters.from);
  }
  if (filters.to) {
    query = query.lte("created_at", filters.to);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[roebel-card-admin] listPurchases error:", error);
    return { purchases: [], totalCount: 0, page, pageSize };
  }

  const rows = (data ?? []) as unknown as Array<
    RoebelCardPurchaseRow & {
      roebel_card: { wallet_address: string } | null;
      beneficiary: { name: string } | null;
    }
  >;

  const purchases: PurchaseWithRelations[] = rows.map((row) => {
    const { roebel_card, beneficiary, ...rest } = row;
    return {
      ...rest,
      card_wallet_address: roebel_card?.wallet_address ?? null,
      beneficiary_name: beneficiary?.name ?? null,
    };
  });

  return {
    purchases,
    totalCount: count ?? purchases.length,
    page,
    pageSize,
  };
}

export async function getRoebelCardOverviewStats(): Promise<OverviewStats> {
  const supabase = createAdminClient();

  // Purchases aggregates (status = 'paid').
  const { data: paidPurchases, error: paidErr } = await supabase
    .from("roebel_card_purchases")
    .select("amount_cents, fee_cents")
    .eq("status", "paid");

  if (paidErr) {
    console.error("[roebel-card-admin] paid purchases aggregate failed:", paidErr);
  }

  let purchaseCount = 0;
  let faceValueCents = 0;
  let feeVolumeCents = 0;
  for (const row of paidPurchases ?? []) {
    purchaseCount += 1;
    faceValueCents += Number(row.amount_cents ?? 0);
    feeVolumeCents += Number(row.fee_cents ?? 0);
  }

  // Vereine share credited so far.
  const { data: contribRows, error: contribErr } = await supabase
    .from("roebel_verein_contributions")
    .select("pending_amount_cents, paid_amount_cents");
  if (contribErr) {
    console.error("[roebel-card-admin] contributions aggregate failed:", contribErr);
  }
  let vereineCreditedCents = 0;
  for (const row of contribRows ?? []) {
    vereineCreditedCents +=
      Number(row.pending_amount_cents ?? 0) + Number(row.paid_amount_cents ?? 0);
  }

  // Röbeler Topf balance.
  const { data: topf } = await supabase
    .from("roebel_verein_fund")
    .select("balance_cents")
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Outstanding card balance total (what buyers still hold).
  const { data: cards, error: cardsErr } = await supabase
    .from("roebel_card")
    .select("balance_cents");
  if (cardsErr) {
    console.error("[roebel-card-admin] cards aggregate failed:", cardsErr);
  }
  let outstandingCardBalanceCents = 0;
  for (const row of cards ?? []) {
    outstandingCardBalanceCents += Number(row.balance_cents ?? 0);
  }

  return {
    purchaseCount,
    grossVolumeCents: faceValueCents + feeVolumeCents,
    faceValueCents,
    feeVolumeCents,
    vereineCreditedCents,
    roebelerTopfBalanceCents: Number(topf?.balance_cents ?? 0),
    outstandingCardBalanceCents,
  };
}

export async function listVereineContributions(): Promise<
  VereineContributionWithAccount[]
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("roebel_verein_contributions")
    .select(
      `id, beneficiary_account_id, pending_amount_cents, paid_amount_cents, updated_at,
       accounts!beneficiary_account_id ( name, account_type, sub_type, is_verified )`,
    )
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[roebel-card-admin] listVereineContributions error:", error);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<
    RoebelVereinContributionRow & {
      accounts: {
        name: string;
        account_type: string;
        sub_type: string | null;
        is_verified: boolean | null;
      } | null;
    }
  >;

  return rows.map((row) => {
    const { accounts, ...rest } = row;
    return {
      ...rest,
      account_name: accounts?.name ?? "—",
      account_type: accounts?.account_type ?? "organisation",
      account_sub_type: accounts?.sub_type ?? null,
      is_verified: accounts?.is_verified ?? false,
    };
  });
}

export interface RoebelerTopfSummary {
  fund: RoebelVereinFundRow | null;
  recentEntries: Array<
    RoebelVereinFundEntryRow & { purchase_wallet_address: string | null }
  >;
}

export async function getRoebelerTopf(): Promise<RoebelerTopfSummary> {
  const supabase = createAdminClient();

  const { data: fund } = await supabase
    .from("roebel_verein_fund")
    .select("*")
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: entries } = await supabase
    .from("roebel_verein_fund_entries")
    .select(
      `id, purchase_id, amount_cents, created_at,
       purchase:roebel_card_purchases!purchase_id ( purchaser_wallet_address )`,
    )
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (entries ?? []) as unknown as Array<
    RoebelVereinFundEntryRow & {
      purchase: { purchaser_wallet_address: string } | null;
    }
  >;

  const recentEntries = rows.map((row) => {
    const { purchase, ...rest } = row;
    return {
      ...rest,
      purchase_wallet_address: purchase?.purchaser_wallet_address ?? null,
    };
  });

  return {
    fund: (fund as RoebelVereinFundRow | null) ?? null,
    recentEntries,
  };
}
