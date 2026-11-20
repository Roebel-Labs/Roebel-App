/**
 * Response shapes of the credential routes, copied field for field from the server
 * (apps/web/src/lib/credentials/{holder,presentations,actions,people,batch}.ts). Keep in sync:
 * the server is the source of truth.
 */
import type { RegisterStep } from '@netizen-labs/credential-registry';
import type { Address, Hex } from 'viem';

export type CredentialKind = 'role' | 'membership' | 'badge';

// ── holder (POST /api/credentials/me) ────────────────────────────────────────

export type InvitationLeaf = { kind: 'account' | 'claimKey'; typeId: Hex; subject: Address; validUntil: string; salt: Hex };

/** holder.ts InvitationView (mine, redeem). */
export type InvitationView = {
  id: string;
  state: 'invited' | 'accepted' | 'declined' | 'revoked';
  type: {
    typeId: Hex;
    name: string;
    description: string | null;
    imageUrl: string | null;
    kind: CredentialKind;
    recognised: boolean;
    publicClaimAllowed: boolean;
    benefits: string[];
    /** The event of an event badge (id, title, "YYYY-MM-DD"); absent from older servers. */
    eventId?: string | null;
    eventTitle?: string | null;
    eventDate?: string | null;
  };
  org: { accountId: string; name: string; avatarUrl: string | null } | null;
  validUntil: string | null;
  /** The type's live card design (drawn on this device with the holder's own fields); absent on older servers. */
  design?: unknown;
  /** sha of that design version. `type.imageUrl` stays the preview picture for older app builds. */
  designSha?: string | null;
  claim: {
    batchId: string;
    leaf: InvitationLeaf;
    proof: Hex[];
    claimSignature: Hex | null;
  };
};

/** holder.ts Holding (holdings). */
export type Holding = { typeId: Hex; held: boolean; visibility: 'public' | 'private' | null; validUntil: string | null };

/** presentations.ts Presentation (present_create payload `{ presentation }`, present_resolve). */
export type Presentation = {
  v: 1;
  typeId: Hex;
  account: Address;
  issuedAtSec: number;
  nonce: string;
  accountSignature: Hex;
  private?: { batchId: string; leaf: InvitationLeaf; proof: Hex[]; claimSignature: Hex | null };
};

export type PresentationCreated = { code: string; expiresAt: string };
export type PresentationResolved = { presentation: Presentation; signatureValid: boolean; ageSeconds: number };

// ── actions (POST /api/credentials/org, /actions) ────────────────────────────

export type ActionStatus = 'awaiting_confirmation' | 'submitted' | 'done' | 'failed' | 'cancelled' | 'expired';
export type ActionVia = 'app' | 'dashboard' | 'studio' | 'node';
export type ActionSummary = { title: string; lines: string[]; orgName: string | null; counts?: { app: number; link: number } };

/** actions.ts ActionView (actions_list). */
export type ActionView = {
  id: string;
  status: ActionStatus;
  summary: ActionSummary;
  via: ActionVia;
  preparedByMe: boolean;
  confirmedByMe: boolean;
  txHash: string | null;
  error: string | null;
  createdAt: string;
  expiresAt: string;
};

/**
 * actions.ts getActionForPhone (action_get). `steps` and `registry` are untrusted: the confirm
 * screen re-parses the steps (parseSteps) and encodes them against the app's own REGISTRY.
 */
export type PhoneAction = {
  id: string;
  status: string;
  steps: RegisterStep[];
  summary: ActionSummary;
  registry: Address;
  expiresAt: string;
};

export type ActionSubmitted = { status: 'done' | 'submitted' };

/** actions.ts OrgListEntry (orgs_list). */
export type OrgListEntry = {
  accountId: string;
  name: string;
  avatarUrl: string | null;
  subType: string | null;
  role: 'owner' | 'admin';
  membersMayBePublic: boolean;
  onChain: 'ready' | 'org_not_registered' | 'no_chain_authority';
};

/** actions.ts TypeView (types_list). */
export type TypeView = {
  typeId: Hex;
  name: string;
  kind: CredentialKind | null;
  description: string | null;
  imageUrl: string | null;
  benefits: string[];
  template: string | null;
  publicClaim: boolean;
  supplyCap: number;
  claimStart: string | null;
  claimEnd: string | null;
  recognised: boolean;
  retired: boolean;
  chainStatus: 'draft' | 'onchain';
};

// ── people and batches (POST /api/credentials/org) ───────────────────────────

export type PersonState = 'eingeladen' | 'angenommen' | 'abgelehnt' | 'widerrufen' | 'abgelaufen';
/** people.ts PersonView (people_list); the plan calls it PersonRow. */
export type PersonRow = { id: string; displayName: string; state: PersonState; public: boolean; validUntil: string | null; hasLink: boolean };
/** people.ts searchPeople row (people_search). `wallet` is for the next request only: never render it. */
export type PersonSearchHit = { wallet: string; displayName: string; avatarUrl: string | null };

/** batch.ts RecipientInput. */
export type RecipientInput =
  | { kind: 'account'; wallet: string; displayName?: string }
  | { kind: 'contact'; name: string; email?: string };

export type BatchPrepared = { actionId: string; batchId: string; counts: { app: number; link: number; skipped: number } };
export type ActionPrepared = { actionId: string };

// ── event badges (plan credreg-4) ────────────────────────────────────────────

/** event_badge_get answer (server: EventBadgeGetResult in apps/web/src/lib/credentials/event-badges.ts). */
export type EventBadgeGetResult = {
  attendees: number;
  notYetIssued: number;
  issued: number;
  accepted: number;
  badge: { typeId: Hex; name: string; imageUrl: string | null; supplyCap: number; chain: 'draft' | 'onchain'; auto: boolean } | null;
};
export type EventBadgePrepared = { actionId: string; typeId: Hex; count: number };
/** An attended event whose badge has not reached the person yet (server: PendingBadge in holder.ts). */
export type PendingBadge = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  orgName: string | null;
  typeId: Hex | null;
  name: string;
  imageUrl: string | null;
  state: 'waiting_for_issue';
};
/** `mine` answer. */
export type MineResult = { invitations: InvitationView[]; pendingBadges: PendingBadge[] };
/** GET /api/credentials/events/<eventId>/badge (public, no names). Unix seconds. */
export type PublicEventBadge = { typeId: Hex; name: string; imageUrl: string | null; claimStart: number; claimEnd: number; collected: number };

/** GET /api/credentials/orgs/<accountId>/public (server: OrgPublicView in org-public.ts). No addresses. */
export type OrgPublicPerson = { displayName: string; avatarUrl: string | null; username: string | null };
export type OrgPublicView = {
  offices: { typeId: Hex; name: string; recognised: boolean; holders: OrgPublicPerson[] }[];
  /** null: the org keeps members private and nobody holds publicly. */
  publicMembers: OrgPublicPerson[] | null;
  badges: { typeId: Hex; name: string; imageUrl: string | null; eventTitle: string | null; collected: number }[];
  usesRegister: boolean;
};
