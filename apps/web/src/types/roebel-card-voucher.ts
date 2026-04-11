// Types for the new euro-voucher Röbel Card system.
// Kept separate from the legacy points/stamp types in `roebel-card.ts`.

export type RoebelVoucherCardStatus = "active" | "frozen" | "deactivated"

export type RoebelCardPurchaseStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refunded"

export interface RoebelVoucherCardRow {
  id: string
  wallet_address: string
  owner_account_id: string | null
  balance_cents: number
  status: RoebelVoucherCardStatus
  qr_secret: string
  label: string | null
  created_at: string
  updated_at: string
}

export interface RoebelCardPurchaseRow {
  id: string
  card_id: string
  amount_cents: number
  fee_cents: number
  beneficiary_account_id: string | null
  purchaser_wallet_address: string
  is_sachbezug: boolean
  employer_account_id: string | null
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  status: RoebelCardPurchaseStatus
  created_at: string
  paid_at: string | null
}

export interface RoebelVereinContributionRow {
  id: string
  beneficiary_account_id: string
  pending_amount_cents: number
  paid_amount_cents: number
  updated_at: string
}

export interface RoebelVereinFundRow {
  id: string
  balance_cents: number
  updated_at: string
}

export interface RoebelVereinFundEntryRow {
  id: string
  purchase_id: string
  amount_cents: number
  created_at: string
}

export interface PurchaseWithRelations extends RoebelCardPurchaseRow {
  card_wallet_address: string | null
  beneficiary_name: string | null
}

export interface VereineContributionWithAccount extends RoebelVereinContributionRow {
  account_name: string
  account_type: string
  account_sub_type: string | null
  is_verified: boolean
}

export interface PurchaseFilters {
  status?: RoebelCardPurchaseStatus | "all"
  /** Account UUID, "all" for no filter, or "topf" for Röbeler Topf only. */
  beneficiaryAccountId?: string
  walletSearch?: string
  from?: string // ISO date
  to?: string // ISO date
}

export interface OverviewStats {
  purchaseCount: number
  grossVolumeCents: number
  faceValueCents: number
  feeVolumeCents: number
  vereineCreditedCents: number
  roebelerTopfBalanceCents: number
  outstandingCardBalanceCents: number
}
