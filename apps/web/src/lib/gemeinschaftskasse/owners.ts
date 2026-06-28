import { getAddress } from "thirdweb/utils";

/** Case-insensitive owner membership check. `owners` from Safe.getOwners(). */
export function matchOwner(
  candidates: (string | undefined)[],
  owners: string[],
): string | null {
  const set = new Set(owners.map((o) => o.toLowerCase()));
  for (const c of candidates) {
    if (c && set.has(c.toLowerCase())) return getAddress(c);
  }
  return null;
}

/**
 * Safe owners are a SENTINEL-anchored linked list. To remove `owner` you must
 * pass the owner that points to it. `owners` MUST be Safe.getOwners() order.
 */
export const SENTINEL = "0x0000000000000000000000000000000000000001";
export function prevOwner(owners: string[], owner: string): string {
  const lower = owners.map((o) => o.toLowerCase());
  const i = lower.indexOf(owner.toLowerCase());
  if (i === -1) throw new Error("owner not found");
  return i === 0 ? SENTINEL : owners[i - 1];
}
