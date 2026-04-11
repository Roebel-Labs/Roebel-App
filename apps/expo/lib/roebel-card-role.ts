// Pure function that decides which Röbel Card experience to show for the
// currently active user: buyer (advertising landing), partner (merchant
// dashboard) or employer (Sachbezug / employee management).
//
// Kept free of Supabase and React so it can be unit-tested in isolation.
//
// RESERVED FOR FUTURE USE — session 2 removed the auto-redirect logic from
// app/roebel-card/index.tsx in favour of explicit "Für Unternehmen" CTAs,
// so this helper has no live callsites right now. It's intentionally kept
// because later sessions (admin views, deep-link gating) will need a pure
// role-derivation primitive again.

export type RoebelCardRole = 'buyer' | 'partner' | 'employer';

export interface RoebelCardRoleInputs {
  /** True when the active account has an approved row in roebel_card_partners. */
  hasApprovedPartnerRecord: boolean;
  /** True when the active account has ever purchased cards with is_sachbezug=true. */
  hasActiveEmployerPurchases: boolean;
}

/**
 * Priority order: partner > employer > buyer.
 *
 * An org that is BOTH a Röbel Card partner (accepts payments) AND an employer
 * buying Sachbezug cards for employees will land on the partner dashboard by
 * default; the employer area is still reachable via a separate menu entry.
 */
export function deriveRoebelCardRole(inputs: RoebelCardRoleInputs): RoebelCardRole {
  if (inputs.hasApprovedPartnerRecord) return 'partner';
  if (inputs.hasActiveEmployerPurchases) return 'employer';
  return 'buyer';
}
