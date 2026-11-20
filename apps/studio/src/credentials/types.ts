// Response shapes of the credential register routes (apps/web/src/lib/credentials on main, plan 2,
// plus the dashboard additions of plan 4). Copied field for field: Studio cannot import from apps/web.
import type { CardDesign } from '@roebel/card-design';

export type Kind = 'role' | 'membership' | 'badge';

/** GET /api/credentials/status (plan 4 Task 1). */
export interface CredentialsStatus {
  enabled: boolean;
  configured: boolean;
  /** app_settings.credential_designer_enabled: drafting works while the register is off. */
  designer: boolean;
}

export type OnChain = 'ready' | 'org_not_registered' | 'no_chain_authority';

/** orgs_list (plan 2 Task 4, `OrgListEntry`). */
export interface OrgListItem {
  accountId: string;
  name: string;
  avatarUrl: string | null;
  subType: string | null;
  role: 'owner' | 'admin';
  membersMayBePublic: boolean;
  onChain: OnChain;
}

/** delegates_list: active delegates of the org's types and the org's members (the picker). The
 * addresses are only sent back with delegate_prepare, never shown. */
export interface DelegatesData {
  delegates: { typeId: string; typeName: string; delegate: string; label: string | null; displayName: string | null }[];
  members: { wallet: string; displayName: string }[];
}

/** types_list (plan 2 `TypeView`); counts are the plan-4 addition and may be absent. */
export interface TypeRow {
  typeId: string;
  name: string;
  kind: Kind | null;
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
  counts?: { accepted: number; open: number };
}

export type PersonState = 'eingeladen' | 'angenommen' | 'abgelehnt' | 'widerrufen' | 'abgelaufen';

/** people_list (plan 2 `PersonView`). */
export interface PersonRow {
  id: string;
  displayName: string;
  state: PersonState;
  public: boolean;
  validUntil: string | null;
  hasLink: boolean;
}

export type ActionStatus = 'awaiting_confirmation' | 'submitted' | 'done' | 'failed' | 'cancelled' | 'expired';

export interface ActionSummary {
  title: string;
  lines: string[];
  orgName: string | null;
  counts?: { app: number; link: number };
}

/** Batch of an action (plan 4 Task 4 `BatchView`). */
export interface BatchView {
  id: string;
  typeId: string;
  count: number;
  status: string;
  invited: number;
  accepted: number;
  revoked: number;
  hasOpenLinks: boolean;
}

/** actions_list (plan 2 `ActionView`, extended with `batches` by plan 4 Task 4). */
export interface ActionView {
  id: string;
  status: ActionStatus;
  summary: ActionSummary;
  via: 'app' | 'dashboard' | 'studio' | 'node';
  preparedByMe: boolean;
  confirmedByMe: boolean;
  txHash: string | null;
  error: string | null;
  createdAt: string;
  expiresAt: string;
  batches?: BatchView[];
}

/** people_preview (plan 4 Task 3). */
export interface PreviewResult {
  app: number;
  link: number;
  skipped: number;
  rejected: { row: number; reason: string }[];
  rows: { displayName: string; channel: 'app' | 'link' | 'mail' }[];
}

/** event_badges_list (plan 4 Task 5). */
export interface EventBadgeListItem {
  eventId: string;
  title: string;
  date: string;
  badge: { typeId: string; name: string; chain: 'draft' | 'onchain'; auto: boolean } | null;
  attendees: number;
  issued: number;
  accepted: number;
}

/** type_prepare payload (plan 2 Task 4). */
export interface TypePreparePayload {
  accountId: string;
  op: 'create' | 'update' | 'retire';
  typeId?: string;
  template?: string;
  name?: string;
  description?: string;
  imageUrl?: string;
  benefits?: string[];
  kind?: Kind;
  publicClaim?: boolean;
  supplyCap?: number;
  claimStart?: string;
  claimEnd?: string;
}

/** Input shared by people_preview and batch_prepare. */
export interface PeopleInput {
  accountId: string;
  typeId: string;
  csv?: string;
  fromMemberList?: boolean;
  validUntil?: string;
}

// ---- card designer (D2, apps/web/src/lib/credentials/designs) -------------------------

/** design_orgs: orgs where the caller is owner or admin (works without the register). */
export interface DesignOrg {
  accountId: string;
  name: string;
  avatarUrl: string | null;
  role: 'owner' | 'admin';
}

/** D2 `DraftView`. */
export interface DraftView {
  id: string;
  name: string;
  kind: Kind;
  template: string | null;
  typeId: string | null;
  revision: number;
  updatedAt: string;
  liveVersion: number | null;
  pendingVersion: number | null;
  hasUnpublishedChanges: boolean;
  testSentAt: string | null;
}

/** D2 `DraftWithDesign` (design_draft_get, and the `data` of a 409 DRAFT_CONFLICT). */
export type DraftWithDesign = DraftView & { design: CardDesign };

export type AssetKind = 'logo' | 'sticker' | 'background' | 'image';

/** D2 `AssetView`. */
export interface AssetView {
  sha: string;
  kind: AssetKind;
  url: string;
  width: number | null;
  height: number | null;
  ai: boolean;
}

/** design_draft_save payload; baseRevision is required together with draftId. */
export interface DraftSavePayload {
  accountId: string;
  draftId?: string;
  baseRevision?: number;
  name: string;
  kind: Kind;
  template?: string | null;
  design: CardDesign;
}
