import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { z } from "zod";

/**
 * NSP-14 — Org Identity.
 *
 * An organisation is an onchain actor: a Safe holding a soulbound OrgNFT in the
 * community's OrgRegistry, approved by its attesters. The Safe alone governs
 * the org's record — which Nostr keys may speak for it, who holds which role,
 * where its metadata lives. No database row is authoritative; any indexer can
 * rebuild the org directory from the registry's events.
 *
 * This module is the single source of truth for the canonical id, the role
 * table, the event tag convention and the metadata shape. Contract:
 * contracts/governor-contract/contracts/verification-system/OrgRegistry.sol.
 * Design: docs/superpowers/specs/2026-09-26-org-safe-identity-design.md.
 */

/**
 * FROZEN. Every published org event and every registry token embeds the id
 * derived from this prefix; changing it re-keys every organisation.
 */
export const ORG_ID_PREFIX = "netizen:org:v1:";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BYTES32 = /^0x[0-9a-f]{64}$/;

/** Canonical org id: keccak256("netizen:org:v1:" + lowercase uuid), 0x-hex. */
export function orgIdFromUuid(uuid: string): `0x${string}` {
  const u = uuid.trim().toLowerCase();
  if (!UUID.test(u)) throw new Error(`not a uuid: ${uuid}`);
  return `0x${bytesToHex(keccak_256(utf8ToBytes(ORG_ID_PREFIX + u)))}`;
}

export function isOrgId(value: string): value is `0x${string}` {
  return BYTES32.test(value);
}

/** Registry role enum, index-aligned with `OrgRegistry.Role`. Owners are not a
 * role: they are the Safe's own owners, read live from the Safe. */
export const ORG_ROLES = ["none", "member", "admin"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export function orgRoleFromIndex(index: number | bigint): OrgRole {
  const role = ORG_ROLES[Number(index)];
  if (!role) throw new Error(`unknown org role index: ${index}`);
  return role;
}

/**
 * Tag every event an org publishes carries: ["netizen_org", <orgId>].
 * A reader accepts the event as the org's iff its pubkey is authorised for
 * that org in the registry right now. The existing ["authorized_by", …] tag
 * still names the member who asked for it.
 */
export const ORG_TAG = "netizen_org";

export interface OrgEventLike {
  pubkey: string;
  tags: string[][];
}

export function orgIdOfEvent(event: OrgEventLike): `0x${string}` | null {
  const tag = event.tags.find((t) => t[0] === ORG_TAG);
  const id = tag?.[1]?.toLowerCase();
  return id && isOrgId(id) ? id : null;
}

/** Answers "may this x-only pubkey publish as this org?" — usually the
 * registry's `isNostrKeyAuthorized`, possibly behind an indexer cache. */
export type OrgKeyLookup = (orgId: `0x${string}`, pubkeyHex: string) => Promise<boolean>;

export type OrgEventVerdict =
  | { ok: true; orgId: `0x${string}` }
  | { ok: false; reason: "no_org_tag" | "bad_pubkey" | "key_not_authorized" };

/**
 * Decide whether an event speaks for the org it names. Signature validity is
 * the caller's job (every Nostr ingest already checks it); this adds only the
 * authority check that turns "some key signed it" into "the org said it".
 */
export async function verifyOrgEvent(event: OrgEventLike, lookup: OrgKeyLookup): Promise<OrgEventVerdict> {
  const orgId = orgIdOfEvent(event);
  if (!orgId) return { ok: false, reason: "no_org_tag" };
  if (!/^[0-9a-f]{64}$/.test(event.pubkey)) return { ok: false, reason: "bad_pubkey" };
  return (await lookup(orgId, event.pubkey)) ? { ok: true, orgId } : { ok: false, reason: "key_not_authorized" };
}

/** Nostr pubkeys (x-only, 64 hex) as the registry's bytes32. */
export function pubkeyToBytes32(pubkeyHex: string): `0x${string}` {
  const p = pubkeyHex.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(p)) throw new Error(`not an x-only pubkey: ${pubkeyHex}`);
  return `0x${p}`;
}

/** Org kinds, matching `accounts.sub_type`. Open-ended on purpose: another
 * town's vocabulary must not fail validation, so unknown kinds pass as strings. */
export const KNOWN_ORG_TYPES = ["restaurant", "unternehmen", "verein", "stadt", "fraktion", "journalist"] as const;

/**
 * The document at `metadataURI` (optional — most orgs keep their profile in a
 * kind 0 event signed by an authorised key, which needs no Safe transaction to
 * edit). Public by definition: nothing personal goes here.
 */
export const OrgMetadataSchema = z.object({
  nsp: z.literal(14),
  version: z.literal(1),
  orgId: z.string().regex(BYTES32),
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(64),
  about: z.string().max(5000).optional(),
  picture: z.string().url().optional(),
  banner: z.string().url().optional(),
  website: z.string().url().optional(),
  /** Community id in the CommunityRegistry (keccak256 of its slug). */
  community: z.string().regex(BYTES32).optional(),
});
export type OrgMetadata = z.infer<typeof OrgMetadataSchema>;

export function safeParseOrgMetadata(input: unknown) {
  return OrgMetadataSchema.safeParse(input);
}
