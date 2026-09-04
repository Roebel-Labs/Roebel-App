/**
 * The "Stablecoin" map layer: which pins accept euro-stablecoin payments.
 *
 * The acceptance set is fetched once per map session from the public view (see
 * lib/merchant/registry.ts fetchAcceptanceSet) and passed in, so these helpers
 * stay pure and testable -- the same shape as filterOpenNow in ./filters.
 */
import type { MerchantEntityType } from '../merchant/types';
import { acceptanceKey } from '../merchant/registry';

export function acceptsStablecoin(
  entityType: MerchantEntityType,
  id: string,
  acceptance: Set<string>,
): boolean {
  return acceptance.has(acceptanceKey(entityType, id));
}

/** No-op when the chip is off, so callers can apply it unconditionally. */
export function filterByAcceptance<T extends { id: string }>(
  items: T[],
  entityType: MerchantEntityType,
  acceptance: Set<string>,
  enabled: boolean,
): T[] {
  if (!enabled) return items;
  return items.filter((item) => acceptsStablecoin(entityType, item.id, acceptance));
}
