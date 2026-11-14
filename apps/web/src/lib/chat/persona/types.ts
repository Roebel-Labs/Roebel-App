// Shapes shared by the persona build, its store and the API (contract in
// docs/superpowers/specs/2026-11-12-ortis-personal-context-design.md §6).
import type { RoutineSchedule } from "../types";
import type { ContactStat } from "./classify";

export type PersonaState = "empty" | "building" | "ready" | "error";
export type PersonaStage = "collect" | "digest" | "synthesize" | "people" | "suggest";
export type PageKind = "overview" | "goals" | "projects" | "profile" | "profile_section" | "notes" | "person" | "core";

export interface PersonaStatus {
  state: PersonaState;
  stage: PersonaStage | null;
  stageLabel: string | null;
  progress: number;
  error: string | null;
  builtAt: string | null;
  sources: { google: boolean; googleMail: boolean; googleCalendar: boolean; roebel: boolean; imports: number; memories: number };
}

export interface PageMeta {
  slug: string; kind: PageKind; title: string; summary: string; parent: string | null; updatedAt: string; editedByUser: boolean;
}
export interface PageFact { label: string; value: string; /** Briefing points only: title of the suggestion that tackles the point. */ action?: string }
export interface PageSource { n: number; label: string; date: string | null }
export interface Page extends PageMeta { body: string; facts: PageFact[]; sources: PageSource[] }
export interface PersonMeta { slug: string; name: string; email: string | null; description: string; priority: number }
export interface PersonaUpdate { at: string; text: string }

export interface Suggestion {
  id: string; kind: "task" | "routine"; title: string; reason: string; prompt: string;
  schedule: RoutineSchedule | null; people: { name: string; slug: string }[];
  /** Done in minutes. */
  quick: boolean;
  /** Not in the previous set. */
  fresh: boolean;
}
export type SuggestionSectionKey = "projects" | "collab" | "improve" | "peers";

export interface ImportMeta { id: string; kind: "claude" | "chatgpt" | "text"; title: string; chars: number; createdAt: string }

// ---- build working set ------------------------------------------------------------

export interface CorpusMail {
  ref: string; dir: "sent" | "received"; threadId: string;
  from: string; fromName: string; to: string[]; subject: string; date: string; text: string;
}
/** One cluster of look-alike automated mails (ten CI failures are one notice with count 10). */
export interface CorpusNotice {
  ref: string; sender: string; subject: string; date: string;
  count?: number; firstDate?: string; snippet?: string;
  /** Looks like a failed payment, a deadline or an access that ends (see isUrgentNotice). */
  urgent?: boolean;
  /** Body excerpt of the newest mail of an urgent cluster: amount, due date and consequence live there. */
  detail?: string;
}
export interface CorpusEvent {
  ref: string; title: string; start: string; allDay: boolean; recurring: boolean; location: string | null; attendees: string[];
}
export interface Corpus {
  selfEmail: string | null;
  /** The person's name as it appears on their own mails. */
  selfName?: string | null;
  /** Other addresses that belong to the person (work mailbox, old address). */
  selfAliases?: string[];
  mails: CorpusMail[];
  notices: CorpusNotice[];
  events: CorpusEvent[];
  contacts: ContactStat[];
  roebel: string[];
  imports: { ref: string; kind: string; title: string; text: string }[];
  memories: string[];
  /** Public happenings in the person's town from the app (events of the next days, fresh news). */
  local?: { place: string; events: string[]; news: string[] };
  warnings: string[];
  /** Which Google sources this build could read (so nobody is told to connect what is connected). */
  connected?: { mail: boolean; calendar: boolean };
  counts: { sent: number; inboxHuman: number; inboxAutomated: number; events: number };
}

export interface DigestFact {
  claim: string;
  type: string;
  people: string[];
  date: string | null;
  refs: string[];
  basis: "stated" | "inferred";
}

export interface Checkpoint {
  mode: "full" | "refresh";
  since: string | null;
  corpus?: Corpus;
  /** Index of the next mail chunk to digest. */
  nextChunk?: number;
  facts?: DigestFact[];
  style?: string[];
  /** Emails of the people still waiting for their page. */
  peopleQueue?: string[];
  peopleDone?: number;
  changed?: string[];
  updateNote?: string;
}
