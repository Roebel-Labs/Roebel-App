// `---split---` convention (spec §3.5): a bot may split one answer into up to
// 3 bubbles. The splitter consumes streamed text deltas and tells the caller
// which text belongs to the current bubble and when a new bubble begins,
// holding back any tail that could be the start of the marker.
export const SPLIT_MARKER = "---split---";
export const MAX_BUBBLES = 3;

export type SplitEvent = { type: "text"; text: string } | { type: "break" };

export class SplitStreamer {
  private pending = "";
  private bubbles = 1;

  constructor(private readonly maxBubbles = MAX_BUBBLES) {}

  push(delta: string): SplitEvent[] {
    this.pending += delta;
    const out: SplitEvent[] = [];
    for (;;) {
      const idx = this.pending.indexOf(SPLIT_MARKER);
      if (idx === -1) break;
      const before = this.pending.slice(0, idx);
      this.pending = this.pending.slice(idx + SPLIT_MARKER.length);
      if (before) out.push({ type: "text", text: before });
      if (this.bubbles < this.maxBubbles) {
        this.bubbles++;
        out.push({ type: "break" });
      } else {
        out.push({ type: "text", text: "\n\n" });
      }
    }
    // Hold back the longest suffix that is a prefix of the marker.
    let keep = 0;
    for (let n = Math.min(SPLIT_MARKER.length - 1, this.pending.length); n > 0; n--) {
      if (SPLIT_MARKER.startsWith(this.pending.slice(-n))) { keep = n; break; }
    }
    const flush = this.pending.slice(0, this.pending.length - keep);
    this.pending = this.pending.slice(this.pending.length - keep);
    if (flush) out.push({ type: "text", text: flush });
    return out;
  }

  end(): SplitEvent[] {
    const rest = this.pending;
    this.pending = "";
    return rest ? [{ type: "text", text: rest }] : [];
  }
}

/** Non-streaming variant: splits a finished text into ≤ max trimmed bubbles. */
export function splitBubbles(text: string, max = MAX_BUBBLES): string[] {
  const raw = text.split(SPLIT_MARKER);
  const head = raw.slice(0, max - 1);
  const tail = raw.slice(max - 1).join("\n\n");
  return [...head, tail].map((s) => s.trim()).filter(Boolean);
}
