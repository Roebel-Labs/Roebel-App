"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type {
  OverviewStats,
  PartnerStatus,
  PartnerWithAccount,
  PurchaseFilters,
  PurchaseWithRelations,
  RoebelCardPartnerRow,
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

  const basePurchases: PurchaseWithRelations[] = rows.map((row) => {
    const { roebel_card, beneficiary, ...rest } = row;
    return {
      ...rest,
      card_wallet_address: roebel_card?.wallet_address ?? null,
      beneficiary_name: beneficiary?.name ?? null,
      purchaser_username: null,
      purchaser_avatar_url: null,
    };
  });

  const purchases = await attachPurchaserProfiles(supabase, basePurchases);

  return {
    purchases,
    totalCount: count ?? purchases.length,
    page,
    pageSize,
  };
}

// Second-query join: `roebel_card_purchases.purchaser_wallet_address` is a
// plain text column (no FK to `users`), so PostgREST can't nested-select it.
// We bulk-fetch the user rows for the current page and merge in memory.
// Wallets are stored lowercased in `users` (see supabase-users.ts convention).
async function attachPurchaserProfiles<
  T extends { purchaser_wallet_address: string },
>(
  supabase: ReturnType<typeof createAdminClient>,
  rows: (T & { purchaser_username: string | null; purchaser_avatar_url: string | null })[],
): Promise<(T & { purchaser_username: string | null; purchaser_avatar_url: string | null })[]> {
  if (rows.length === 0) return rows;

  const wallets = Array.from(
    new Set(rows.map((r) => r.purchaser_wallet_address.toLowerCase())),
  );

  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("wallet_address, username, profile_picture_url")
    .in("wallet_address", wallets);

  if (usersErr) {
    console.error("[roebel-card-admin] users lookup failed:", usersErr);
    return rows;
  }

  const byWallet = new Map<
    string,
    { username: string | null; profile_picture_url: string | null }
  >();
  for (const u of users ?? []) {
    byWallet.set((u.wallet_address as string).toLowerCase(), {
      username: (u.username as string | null) ?? null,
      profile_picture_url: (u.profile_picture_url as string | null) ?? null,
    });
  }

  return rows.map((row) => {
    const profile = byWallet.get(row.purchaser_wallet_address.toLowerCase());
    return {
      ...row,
      purchaser_username: profile?.username ?? null,
      purchaser_avatar_url: profile?.profile_picture_url ?? null,
    };
  });
}

export async function getRoebelCardOverviewStats(): Promise<OverviewStats> {
  const supabase = createAdminClient();

  // Purchases aggregates (single query, tally paid + pending by status).
  const { data: allPurchases, error: paidErr } = await supabase
    .from("roebel_card_purchases")
    .select("amount_cents, fee_cents, status")
    .in("status", ["paid", "pending"]);

  if (paidErr) {
    console.error(
      "[roebel-card-admin] purchases aggregate failed:",
      paidErr,
    );
  }

  let purchaseCount = 0;
  let faceValueCents = 0;
  let feeVolumeCents = 0;
  let pendingCount = 0;
  let pendingFaceValueCents = 0;
  let pendingFeeVolumeCents = 0;
  for (const row of allPurchases ?? []) {
    const amount = Number(row.amount_cents ?? 0);
    const fee = Number(row.fee_cents ?? 0);
    if (row.status === "paid") {
      purchaseCount += 1;
      faceValueCents += amount;
      feeVolumeCents += fee;
    } else if (row.status === "pending") {
      pendingCount += 1;
      pendingFaceValueCents += amount;
      pendingFeeVolumeCents += fee;
    }
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
    pendingCount,
    pendingFaceValueCents,
    pendingFeeVolumeCents,
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

// ---------------------------------------------------------------------------
// Partner management
// ---------------------------------------------------------------------------

export async function listRoebelCardPartners(
  statusFilter?: PartnerStatus | "all",
): Promise<PartnerWithAccount[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from("roebel_card_partners")
    .select(
      `id, account_id, iban_last4, bic, account_holder, rechtsform, vat_id,
       agreement_version, agreement_signed_at, status,
       pending_balance_cents, lifetime_volume_cents,
       approved_at, created_at, updated_at,
       accounts!account_id ( name, avatar_url )`,
    )
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[roebel-card-admin] listPartners error:", error);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<
    RoebelCardPartnerRow & {
      accounts: { name: string; avatar_url: string | null } | null;
    }
  >;

  return rows.map((row) => {
    const { accounts, ...rest } = row;
    return {
      ...rest,
      account_name: accounts?.name ?? "—",
      account_avatar_url: accounts?.avatar_url ?? null,
    };
  });
}

export async function approveRoebelCardPartner(
  partnerId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("roebel_card_partners")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerId);

  if (error) {
    console.error("[roebel-card-admin] approvePartner error:", error);
    return { success: false, error: "Fehler beim Genehmigen des Partners" };
  }

  revalidatePath("/admin/dashboard/roebel-card/partners");
  return { success: true };
}

export async function rejectRoebelCardPartner(
  partnerId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("roebel_card_partners")
    .update({
      status: "rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerId);

  if (error) {
    console.error("[roebel-card-admin] rejectPartner error:", error);
    return { success: false, error: "Fehler beim Ablehnen des Partners" };
  }

  revalidatePath("/admin/dashboard/roebel-card/partners");
  return { success: true };
}
