// Screen model for the canvas view. Generated apps structure their UI as
// `<main> > <section data-screen="slug" data-title="…">` (see SCREEN_RULES in
// the codegen prompt). These helpers parse screens out of complete AND partial
// (mid-stream) documents, diff them against the previous version, and build
// per-screen documents for canvas frames.

export interface ParsedScreen {
  name: string;
  title: string;
  /** Declared visual states (`data-states="offen,fehler"`), first = default. Empty = single state. */
  states: string[];
  /** Full `<section …>…</section>` markup — null while the section is still streaming in. */
  outer: string | null;
}

const OPEN_RE = /<section\b[^>]*\bdata-screen="([a-z0-9-]{1,40})"[^>]*>/gi;
const MAX_STATES = 4;

/** Parse screens in document order. Tolerates partial documents (open sections → outer null). */
export function parseScreens(html: string): ParsedScreen[] {
  const out: ParsedScreen[] = [];
  if (!html) return out;
  OPEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN_RE.exec(html))) {
    const name = m[1];
    if (out.some((s) => s.name === name)) continue;
    const titleMatch = /data-title="([^"]*)"/i.exec(m[0]);
    const statesMatch = /data-states="([^"]*)"/i.exec(m[0]);
    const states = (statesMatch?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[a-z0-9-]{1,24}$/.test(s))
      .slice(0, MAX_STATES);
    // Contract: screens never nest sections, so the next </section> closes this one.
    const close = html.indexOf("</section>", m.index);
    out.push({
      name,
      title: titleMatch?.[1] || name,
      states: states.length >= 2 ? states : [],
      outer: close >= 0 ? html.slice(m.index, close + "</section>".length) : null,
    });
  }
  return out;
}

/** Per-screen state while a generation streams in. */
export type ScreenPhase =
  | "idle" //          not streaming — final render
  | "pending" //       stream hasn't reached this (previous-version) screen yet
  | "writing" //       the AI is writing this screen right now → shimmer
  | "done-changed" //  arrived and differs from the previous version
  | "done-same"; //    arrived unchanged

/** One canvas frame: a screen in one of its states (state null = the screen as-is). */
export interface CanvasFrameSpec {
  state: string | null;
  /** srcdoc for this frame (null → placeholder card). */
  doc: string | null;
}

export interface CanvasScreen {
  name: string;
  title: string;
  phase: ScreenPhase;
  frames: CanvasFrameSpec[];
}

/** Inject a head style that forces exactly one screen visible (canvas isolation). */
export function buildScreenDoc(fullHtml: string, screen: string | null): string {
  if (!screen) return fullHtml;
  const safe = screen.replace(/[^a-z0-9-]/gi, "");
  const style = `<style>main > section[data-screen]{display:none !important}main > section[data-screen="${safe}"]{display:block !important}</style>`;
  const i = fullHtml.lastIndexOf("</head>");
  return i >= 0 ? fullHtml.slice(0, i) + style + fullHtml.slice(i) : fullHtml;
}

/**
 * Screen + forced state: the app's init code reads `__NETIZEN_PREVIEW_STATE__`
 * (contract) and renders the state with demo data — one live frame per state,
 * like Figma frames.
 */
export function buildStateDoc(fullHtml: string, screen: string, state: string | null): string {
  let doc = buildScreenDoc(fullHtml, screen);
  if (state) {
    const inject = `<script>window.__NETIZEN_PREVIEW_STATE__=${JSON.stringify({ screen, state })};</script>`;
    const i = doc.lastIndexOf("</head>");
    doc = i >= 0 ? doc.slice(0, i) + inject + doc.slice(i) : inject + doc;
  }
  return doc;
}

/**
 * Static per-screen document from a PARTIAL stream: completed head + one
 * completed section. App scripts (end of body) haven't arrived — this is a
 * visual-only render used while streaming.
 */
export function buildPartialScreenDoc(partialHtml: string, outer: string): string | null {
  const headEnd = partialHtml.indexOf("</head>");
  if (headEnd < 0) return null;
  const bodyMatch = /<body[^>]*>/i.exec(partialHtml);
  return (
    partialHtml.slice(0, headEnd) +
    `<style>main > section[data-screen]{display:block !important}</style></head>` +
    (bodyMatch ? bodyMatch[0] : "<body>") +
    `<main class="mx-auto max-w-md p-4">` +
    outer +
    `</main></body></html>`
  );
}

/**
 * Compute the canvas frame list. While streaming, previous-version screens stay
 * on the board (pending), screens currently being written shimmer, and screens
 * whose new markup already arrived render their fresh state.
 */
export function computeCanvasScreens(
  baseHtml: string | null,
  stream: string,
  streaming: boolean,
): CanvasScreen[] {
  const base = parseScreens(baseHtml ?? "");
  const baseDoc = (name: string): string | null =>
    baseHtml ? buildScreenDoc(baseHtml, name) : null;
  const single = (doc: string | null): CanvasFrameSpec[] => [{ state: null, doc }];

  if (!streaming) {
    if (base.length === 0 && baseHtml) {
      // Pre-screen-contract app: render the whole document as one frame.
      return [{ name: "app", title: "App", phase: "idle", frames: single(baseHtml) }];
    }
    // Settled board: one live frame per declared state (Figma-frames style).
    return base.map((s) => ({
      name: s.name,
      title: s.title,
      phase: "idle" as const,
      frames: s.states.length
        ? s.states.map((state) => ({
            state,
            doc: baseHtml ? buildStateDoc(baseHtml, s.name, state) : null,
          }))
        : single(baseDoc(s.name)),
    }));
  }

  // While streaming, each screen collapses to ONE frame (forced states need the
  // app scripts, which only arrive at the end of the stream).
  const incoming = parseScreens(stream);
  const baseByName = new Map(base.map((s) => [s.name, s]));
  const seen = new Set<string>();
  const out: CanvasScreen[] = [];

  for (const s of incoming) {
    seen.add(s.name);
    const prev = baseByName.get(s.name);
    if (s.outer === null) {
      // Being written right now.
      out.push({
        name: s.name,
        title: s.title,
        phase: "writing",
        frames: single(prev ? baseDoc(s.name) : null),
      });
    } else if (prev?.outer === s.outer) {
      out.push({ name: s.name, title: s.title, phase: "done-same", frames: single(baseDoc(s.name)) });
    } else {
      out.push({
        name: s.name,
        title: s.title,
        phase: "done-changed",
        frames: single(buildPartialScreenDoc(stream, s.outer) ?? (prev ? baseDoc(s.name) : null)),
      });
    }
  }

  // Previous-version screens the stream hasn't reached yet.
  for (const s of base) {
    if (!seen.has(s.name)) {
      out.push({ name: s.name, title: s.title, phase: "pending", frames: single(baseDoc(s.name)) });
    }
  }

  // First generation, before any section appears: one shimmering placeholder.
  if (out.length === 0) {
    out.push({ name: "app", title: "App", phase: "writing", frames: single(null) });
  }
  return out;
}
