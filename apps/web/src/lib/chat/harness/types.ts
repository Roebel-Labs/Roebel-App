// Ortis agent harness contract (spec docs/superpowers/specs/2026-09-26-ortis-agent-harness-design.md §3).
// Relative imports only, so `npx tsx --test` resolves them.
import type { z } from "zod";
import type { ApprovalPreview, CalendarContextEvent, ChatPart } from "../types";

export type { ApprovalPreview } from "../types";

/** Device signing request carried by a money approval card (spec §3). */
export type SignRequest = NonNullable<Extract<ChatPart, { type: "approval" }>["signRequest"]>;

export type Risk = 'read' | 'private' | 'public' | 'money' | 'external';

export interface TenantConfig {
  id: string;                 // 'roebel'
  name: string;               // 'Röbel/Müritz'
  region: string;             // 'Mecklenburgische Seenplatte'
  timezone: string;           // 'Europe/Berlin'
  locale: 'de';
  appOrigin: string;          // 'https://www.roebel.app'
  facts: string[];            // short grounding facts for the system prompt
}

export interface HarnessProfile {
  displayName: string | null;
  username: string | null;
  isCitizen: boolean;
  orgs: { id: string; name: string; role: string; kind: string }[];
}

export interface HarnessContext {
  tenant: TenantConfig;
  wallet: string;             // lower-case; NEVER shown to the model as identity text
  profile: HarnessProfile | null;
  threadId: string;
  botId: string;
  taskId: string | null;
  emitPart(part: ChatPart): void;   // attach a part to the current bot message
  /** Per-turn state for the built-in chat tools (additive to spec §3; absent outside a chat turn). */
  turn?: HarnessTurn;
}

export interface HarnessTurn {
  /** Device-calendar events the app sent; null/undefined = no read access. */
  calendarContext?: CalendarContextEvent[] | null;
  /** Scheduled routine run (no human watching → no routine tools). */
  routineRun?: boolean;
  /** Parts of the last few stored messages (dedupe of cards). */
  recentParts?: ChatPart[];
  /** Parts emitted so far in this turn (same array emitPart pushes into). */
  emitted?: ChatPart[];
  /**
   * Live part update (images pack): replaces the emitted part with the same live
   * key (generated_image by imageId) — or attaches it — and streams it to the app
   * right away instead of at the end of the turn. Absent outside a streamed chat turn.
   */
  updatePart?(part: ChatPart): void;
}

export type ToolPack = 'roebel' | 'user' | 'web' | 'memory' | 'chat' | 'actions' | 'money' | 'connectors' | 'tasks' | 'images';

export interface HarnessTool<I = any> {
  name: string;               // snake_case, unique
  pack: ToolPack;
  risk: Risk;
  description: string;        // German, for the model
  inputSchema: z.ZodType<I>;
  /** German one-liner for approval cards + audit ("Beitrag im Röbel-Feed veröffentlichen"). */
  summarize(input: I, ctx: HarnessContext): string;
  /** Rich preview for the approval card (gated tools). */
  preview?(input: I, ctx: HarnessContext): Promise<ApprovalPreview> | ApprovalPreview;
  /**
   * Money tools only: the device signing request for the approval card
   * (resolved server-side; toWallet is never model-visible). Throwing a
   * ToolInputError turns into a model-facing error instead of a card.
   */
  signRequest?(input: I, ctx: HarnessContext): Promise<SignRequest> | SignRequest;
  execute(input: I, ctx: HarnessContext): Promise<unknown>;
  /** Tool is only offered when this returns true (e.g. user owns an org). */
  available?(ctx: HarnessContext): boolean;
}

/** Packs self-register through this surface (see registry.ts / packs/index.ts). */
export interface ToolRegistry {
  registerTool<I>(tool: HarnessTool<I>): void;
}
