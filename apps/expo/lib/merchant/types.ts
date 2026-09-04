/** Merchant stablecoin-acceptance registry types (spec 2026-09-04, slice 1a). */

export type MerchantAccountStatus =
  | 'pending_kyc'
  | 'kyc_approved'
  | 'deploying'
  | 'live'
  | 'suspended';

/** A Konto can back a business, a restaurant or an org account -- all map pins. */
export type MerchantEntityType = 'business' | 'restaurant' | 'account';

export interface MerchantPaymentAccount {
  id: string;
  gpUserId: string | null;
  /** The Gnosis Pay Safe -- the receive address. Null until deployed. */
  safeAddress: string | null;
  status: MerchantAccountStatus;
  token: string;
  chainId: number;
}

export interface MerchantRegistryResponse {
  ok: boolean;
  code?: string;
  message?: string;
}
