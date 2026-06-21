// Composite civic-reputation model for Röbel Münzen holders. Combines four
// signals (see docs/CIRCLES_TOKENOMICS.md §8). Weights are named constants so
// they are easy to tune. Pure — no IO.

export const REPUTATION_WEIGHTS = {
  trust: 0.35, // web-of-trust in-degree
  attendance: 0.2, // proof-of-attendance (event_attend)
  civic: 0.3, // votes + checkpoints + event submissions + referrals
  economic: 0.15, // RCRC economic throughput (log-scaled)
} as const;

export interface RepInput {
  address: string;
  /** Number of incoming Circles trust edges. */
  trustInDegree: number;
  /** event_attend reward claims. */
  attendance: number;
  /** vote + checkpoint + event_submit + referral reward claims. */
  civic: number;
  /** RCRC throughput in whole Münzen (minted + sent + received + spent). */
  economic: number;
}

export interface RepScored extends RepInput {
  /** 0–100 composite score. */
  score: number;
  /** Per-signal contribution to the score (each already weighted, 0–100). */
  parts: { trust: number; attendance: number; civic: number; economic: number };
}

/**
 * Normalize each signal to 0–1 against the cohort max (economic is log-scaled
 * so a few large holders don't flatten everyone else), then apply weights.
 */
export function scoreReputations(entries: RepInput[]): RepScored[] {
  if (entries.length === 0) return [];
  const eco = (v: number) => Math.log10(1 + Math.max(0, v));
  const max = {
    trust: Math.max(1, ...entries.map((e) => e.trustInDegree)),
    attendance: Math.max(1, ...entries.map((e) => e.attendance)),
    civic: Math.max(1, ...entries.map((e) => e.civic)),
    economic: Math.max(1e-9, ...entries.map((e) => eco(e.economic))),
  };
  const W = REPUTATION_WEIGHTS;
  return entries
    .map((e) => {
      const parts = {
        trust: (W.trust * e.trustInDegree) / max.trust * 100,
        attendance: (W.attendance * e.attendance) / max.attendance * 100,
        civic: (W.civic * e.civic) / max.civic * 100,
        economic: (W.economic * eco(e.economic)) / max.economic * 100,
      };
      const score = parts.trust + parts.attendance + parts.civic + parts.economic;
      return { ...e, score, parts };
    })
    .sort((a, b) => b.score - a.score);
}
