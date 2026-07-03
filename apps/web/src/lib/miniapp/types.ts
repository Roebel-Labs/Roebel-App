// Shared types for the Netizen Mini App platform data layer (apps/web).
//
// These mirror the frozen Supabase DDL (spec §3.5) and re-export the SDK's
// manifest/permission enums so the whole web surface (API routes, admin
// console, builder dashboard, AI builder) speaks one vocabulary.
//
// The AI-builder agent (D) imports from here — keep the exports stable.
import type {
  MiniAppCategory,
  MiniAppManifest,
  MiniAppPermission,
  MiniAppStatus,
} from "@netizen/miniapp-sdk";

export type {
  MiniAppCategory,
  MiniAppManifest,
  MiniAppPermission,
  MiniAppStatus,
};

// ── Row shapes (snake_case, straight off Postgres) ──────────────────────────

export interface DeveloperRow {
  id: string;
  created_at: string;
  wallet: string; // lowercased
  display_name: string | null;
  email: string | null;
  town: string | null;
  status: "active" | "suspended";
}

export interface MiniAppRow {
  id: string;
  created_at: string;
  updated_at: string;
  developer_id: string | null;
  slug: string;
  name: string;
  icon_url: string | null;
  home_url: string;
  description: string | null;
  category: string;
  tags: string[];
  screenshots: string[];
  permissions: string[];
  primary_color: string | null;
  status: MiniAppStatus;
  featured: boolean;
  reward_budget: number;
  reward_spent: number;
  review_notes: string | null;
  source: "external" | "ai_builder" | "first_party";
}

export interface MiniAppVersionRow {
  id: string;
  created_at: string;
  mini_app_id: string;
  version: string;
  home_url: string;
  manifest: MiniAppManifest | Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface MiniAppEventRow {
  id: string;
  created_at: string;
  mini_app_id: string | null;
  slug: string | null;
  session_id: string;
  wallet: string | null;
  event: string;
  ref: string | null;
  props: Record<string, unknown>;
}

export interface MiniAppRewardRow {
  id: string;
  created_at: string;
  mini_app_id: string;
  wallet: string;
  amount: number;
  reason: string | null;
  idempotency_key: string;
  status: "pending" | "granted" | "failed" | "rejected";
  tx_ref: string | null;
}

// ── Filters / inputs ────────────────────────────────────────────────────────

export interface ListAppsFilter {
  /** Restrict to a single status, or a set of statuses. */
  status?: MiniAppStatus | MiniAppStatus[];
  developerId?: string;
  category?: MiniAppCategory;
  featured?: boolean;
  /** free-text over name/slug/description */
  search?: string;
  limit?: number;
}

export type ReviewDecision = "approve" | "reject";

export interface SubmitAppInput {
  manifest: MiniAppManifest;
  developerId: string;
  /** Where the app was created. Defaults to 'external'. */
  source?: MiniAppRow["source"];
  /** Optional initial version label (defaults to '1.0.0'). */
  version?: string;
}

export interface GrantRewardInput {
  amount: number;
  reason: string;
  idempotencyKey: string;
  /** Recipient wallet (the user who performed the action). Lowercased internally. */
  wallet: string;
}

export interface GrantRewardOutcome {
  granted: boolean;
  txRef?: string;
  remainingBudget: number;
}

// ── Analytics ───────────────────────────────────────────────────────────────

export type AnalyticsRange = "24h" | "7d" | "30d" | "90d" | "all";

export interface AnalyticsSeriesPoint {
  date: string; // YYYY-MM-DD
  opens: number;
  uniqueWallets: number;
  rewards: number;
}

export interface AnalyticsSummary {
  appId: string | "all";
  range: AnalyticsRange;
  opens: number;
  uniqueWallets: number;
  events: number;
  /** wallets active in the LATER half of the range who were also active in the earlier half */
  returningWallets: number;
  retentionRate: number; // 0..1
  rewardsGranted: number;
  rewardsAmount: number;
  budget: number | null;
  spent: number | null;
  series: AnalyticsSeriesPoint[];
  topEvents: { event: string; count: number }[];
  generatedAt: number;
}

// ── Errors ──────────────────────────────────────────────────────────────────

/** Maps to a bridge error code; the API layer surfaces `.code` in JSON. */
export class MiniAppError extends Error {
  code:
    | "budget_exceeded"
    | "rate_limited"
    | "not_found"
    | "invalid_params"
    | "unauthorized"
    | "conflict"
    | "internal";
  status: number;
  constructor(
    code: MiniAppError["code"],
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "MiniAppError";
    this.code = code;
    this.status =
      status ??
      (code === "not_found"
        ? 404
        : code === "unauthorized"
          ? 401
          : code === "conflict"
            ? 409
            : code === "internal"
              ? 500
              : 400);
  }
}
