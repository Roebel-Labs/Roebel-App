/**
 * Transcript import for Hören episodes.
 *
 * Every format is normalised into ordered segments `{ start, end, text }`
 * (seconds). The Expo player highlights the segment whose window contains the
 * playhead, so timings only need to be as precise as one line/paragraph.
 *
 * - SRT / WebVTT / LRC carry their own timings (exact).
 * - Plain text has none: paragraphs (or sentences of a long paragraph) are
 *   spread over the audio length proportionally to their character count. A
 *   reasonable first pass; the admin's tap-sync tool replaces it with real
 *   timings.
 */

export type TranscriptSegment = { start: number; end: number; text: string }
export type TranscriptFormat = "plain" | "srt" | "vtt" | "lrc"

const SRT_TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/
const VTT_TIME = /(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{1,3})/
const LRC_LINE = /^\s*\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/

function ms(fraction: string | undefined): number {
  if (!fraction) return 0
  return Number(fraction.padEnd(3, "0")) / 1000
}

export function detectTranscriptFormat(raw: string): TranscriptFormat {
  const text = raw.trim()
  if (/^WEBVTT/.test(text)) return "vtt"
  if (/\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(text)) return "srt"
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length > 0 && lines.filter((l) => LRC_LINE.test(l)).length / lines.length > 0.6) return "lrc"
  return "plain"
}

function cleanCueText(lines: string[]): string {
  return lines
    .join(" ")
    .replace(/<[^>]+>/g, "") // VTT voice/style tags
    .replace(/\s+/g, " ")
    .trim()
}

function parseCues(raw: string, timeRe: RegExp, toSeconds: (m: RegExpMatchArray) => number): TranscriptSegment[] {
  const blocks = raw.replace(/\r/g, "").split(/\n{2,}/)
  const segments: TranscriptSegment[] = []
  for (const block of blocks) {
    const lines = block.split("\n")
    const timingIndex = lines.findIndex((l) => l.includes("-->"))
    if (timingIndex === -1) continue
    const [left, right] = lines[timingIndex].split("-->")
    const a = left.match(timeRe)
    const b = right?.match(timeRe)
    if (!a || !b) continue
    const text = cleanCueText(lines.slice(timingIndex + 1))
    if (!text) continue
    segments.push({ start: toSeconds(a), end: toSeconds(b), text })
  }
  return segments
}

function parseSrt(raw: string): TranscriptSegment[] {
  return parseCues(raw, SRT_TIME, (m) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms(m[4]))
}

function parseVtt(raw: string): TranscriptSegment[] {
  return parseCues(raw, VTT_TIME, (m) => Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms(m[4]))
}

function parseLrc(raw: string, durationSeconds: number | null): TranscriptSegment[] {
  const starts: { start: number; text: string }[] = []
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(LRC_LINE)
    if (!m || !m[4].trim()) continue
    starts.push({ start: Number(m[1]) * 60 + Number(m[2]) + ms(m[3]), text: m[4].trim() })
  }
  starts.sort((x, y) => x.start - y.start)
  return withEnds(starts, durationSeconds)
}

/** Fill `end` from the next segment's start; the last one runs to the end of the audio. */
export function withEnds(
  starts: { start: number; text: string }[],
  durationSeconds: number | null,
): TranscriptSegment[] {
  return starts.map((s, i) => ({
    start: s.start,
    end: i + 1 < starts.length ? starts[i + 1].start : Math.max(s.start + 1, durationSeconds ?? s.start + 10),
    text: s.text,
  }))
}

/**
 * Splits plain text into readable units: paragraphs, and paragraphs longer
 * than ~260 characters further into sentence groups, so one highlighted unit
 * never fills the whole screen.
 */
export function splitPlainText(raw: string): string[] {
  const paragraphs = raw
    .replace(/\r/g, "")
    .split(/\n\s*\n|\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)

  const units: string[] = []
  for (const p of paragraphs) {
    if (p.length <= 260) {
      units.push(p)
      continue
    }
    const sentences = p.match(/[^.!?…]+[.!?…]+["“”»«']*\s*|[^.!?…]+$/g) ?? [p]
    let current = ""
    for (const s of sentences) {
      if (current && (current + s).length > 220) {
        units.push(current.trim())
        current = ""
      }
      current += s
    }
    if (current.trim()) units.push(current.trim())
  }
  return units
}

function parsePlain(raw: string, durationSeconds: number | null): TranscriptSegment[] {
  const units = splitPlainText(raw)
  if (units.length === 0) return []
  const total = durationSeconds && durationSeconds > 0 ? durationSeconds : units.length * 8
  const weights = units.map((u) => u.length + 20) // + pause per unit
  const sum = weights.reduce((a, b) => a + b, 0)
  let cursor = 0
  return units.map((text, i) => {
    const length = (weights[i] / sum) * total
    const segment = { start: round(cursor), end: round(cursor + length), text }
    cursor += length
    return segment
  })
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

export function parseTranscript(
  raw: string,
  durationSeconds: number | null,
  format: TranscriptFormat = detectTranscriptFormat(raw),
): { format: TranscriptFormat; segments: TranscriptSegment[] } {
  switch (format) {
    case "srt":
      return { format, segments: parseSrt(raw) }
    case "vtt":
      return { format, segments: parseVtt(raw) }
    case "lrc":
      return { format, segments: parseLrc(raw, durationSeconds) }
    default:
      return { format: "plain", segments: parsePlain(raw, durationSeconds) }
  }
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return `${m}:${rest.toFixed(1).padStart(4, "0")}`
}
