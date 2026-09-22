import type { RatioClass } from "./ratio";

export type PosterMode = "reformat" | "design";
export type PosterImageKind = "poster" | "photo" | "logo" | "graphic" | "screenshot";
export type PosterImageQuality = "ok" | "low_res" | "blurry";
export type PosterRequester = "admin" | "org" | "submitter";
export type PosterProposalStatus = "proposed" | "selected" | "rejected";

/** What Claude vision says about the uploaded event image. */
export interface PosterAnalysis {
  kind: PosterImageKind;
  hasEventInfo: boolean;
  visibleText: string[];
  hasUiChrome: boolean;
  brandColors: string[];
  styleNotes: string;
  quality: PosterImageQuality;
}

/** The event fields the poster pipeline reads (events row or a pre-submit draft). */
export interface PosterEventInput {
  title: string;
  date?: string | null;
  time?: string | null;
  end_time?: string | null;
  location?: string | null;
  category?: string | null;
  ticket_price?: number | string | null;
  organizer_name?: string | null;
  description?: string | null;
  website_url?: string | null;
  image_url?: string | null;
}

/** Deterministic German lines; null = not on the poster. */
export interface PosterContent {
  title: string;
  dateLine: string | null;
  timeLine: string | null;
  placeLine: string | null;
  priceLine: string | null;
  organizerLine: string | null;
  websiteLine: string | null;
  category: string | null;
}

/** LLM-drafted optional text (never facts). */
export interface PosterCopy {
  subline: string;
  highlights: string[];
}

export interface PosterDirection {
  id: string;
  label: string;
  brief: string;
}

/** Stored per event after every analysis run (events.poster_check). */
export interface PosterCheck {
  checkedAt: string;
  width: number | null;
  height: number | null;
  ratio: RatioClass | null;
  mode: PosterMode | "skip";
  analysis: PosterAnalysis | null;
}

/** Row of event_poster_proposals as the UI needs it. */
export interface PosterProposal {
  id: string;
  batch_id: string;
  event_id: string | null;
  draft_id: string | null;
  account_id: string | null;
  requested_by: PosterRequester;
  mode: PosterMode;
  variant: 1 | 2;
  direction: string;
  source_image_url: string | null;
  image_url: string;
  status: PosterProposalStatus;
  cost_usd: number | null;
  created_at: string;
}

export type ProposeResult =
  | { skipped: "ratio_ok_poster" | "nothing_to_design"; check: PosterCheck | null }
  | {
      batchId: string;
      mode: PosterMode;
      check: PosterCheck | null;
      proposals: PosterProposal[];
      costUsd: number;
    };
