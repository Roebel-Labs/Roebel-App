// Pure helpers for the Deliberate protocol (no expo/thirdweb imports — unit-testable).
// Protocol reference: deliberate-app/contracts @ 0392bd43 (pinned; see the design spec).

export type DebatePhase = 'editing' | 'rating' | 'tallying' | 'finished';

/** The initial vote-token grant per participant, in hundredths ("100.00 Punkte"). */
export const INITIAL_TOKENS = 10_000;
/** The smallest deposit an argument's creator may seed its market with. */
export const MIN_DEPOSIT = 1_000;
/** The protocol's cap on one argument text: a 1 KiB IPFS raw-leaves block. */
export const MAX_CONTENT_BYTES = 1_024;
/** The protocol's cap on arguments per debate, thesis included. */
export const MAX_ARGUMENTS = 512;

/**
 * The live phase follows from the time gates; `finished` is the only stored latch
 * (set once `tallyTree` has run) and wins over every gate.
 */
export function derivePhase(
  nowSec: number,
  editingEndTime: number,
  ratingEndTime: number,
  finished: boolean,
): DebatePhase {
  if (finished) return 'finished';
  if (nowSec < editingEndTime) return 'editing';
  if (nowSec < ratingEndTime) return 'rating';
  return 'tallying';
}

/** An argument's approval is its pro-share price: con / (pro + con). Empty market = undecided. */
export function approvalPercent(pro: number, con: number): number {
  const total = pro + con;
  if (total <= 0) return 50;
  return Math.round((con / total) * 100);
}

/** Vote tokens are held in hundredths; display with a German decimal comma, trimmed. */
export function formatPunkte(hundredths: number): string {
  const whole = Math.trunc(hundredths / 100);
  const rest = Math.abs(hundredths % 100);
  if (rest === 0) return String(whole);
  const cents = String(rest).padStart(2, '0').replace(/0$/, '');
  return `${whole},${cents}`;
}

export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp <= 0x7f) bytes += 1;
    else if (cp <= 0x7ff) bytes += 2;
    else if (cp <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

export interface DebateArgumentNode {
  id: number;
  /** null for the thesis (argument 0). */
  parentId: number | null;
  creator: string;
  /** null for the thesis; otherwise whether it supports its parent. */
  isSupporting: boolean | null;
  /** Lowercase sha-256 hex of the argument text (no 0x prefix). */
  contentDigest: string;
  finalizationTime: number;
  pro: number;
  con: number;
  votes: number;
  /** Tallied rating; null until the debate is finished. */
  rating: number | null;
  children: DebateArgumentNode[];
}

/** Nests a flat argument list under the thesis (id 0). Children keep ascending id order. */
export function buildArgumentTree(args: Omit<DebateArgumentNode, 'children'>[]): DebateArgumentNode {
  const nodes = new Map<number, DebateArgumentNode>();
  for (const a of args) nodes.set(a.id, { ...a, children: [] });
  const root = nodes.get(0);
  if (!root) throw new Error('argument tree has no thesis (id 0)');
  const sorted = [...nodes.values()].sort((a, b) => a.id - b.id);
  for (const node of sorted) {
    if (node.id === 0) continue;
    const parent = node.parentId != null ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
  }
  return root;
}
