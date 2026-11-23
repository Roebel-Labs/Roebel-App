// Gallery illustrations for the templates (viewBox 0 0 320 180). One calm style for all:
// warm stone background, one white card cut off at the bottom, grey skeleton content, a
// single navy accent and a small round badge with a line icon. No shadows, no colour
// fields — hairline borders do the separation (Ortis UI rules).

const BG_TOP = "#F7F6F4";
const BG_BOTTOM = "#ECEAE7";
const LINE = "#E7E5E4";
const SOFT = "#EFEDEA";
const MID = "#D6D3D1";
const INK = "#292524";
const ACCENT = "#00498B";

let seq = 0;

/** Background, card and optional badge around the given card content (drawn in card space). */
function frame(content: string, badge?: { x: number; y: number; icon: string }): string {
  const id = `tg${++seq}`;
  const b = badge
    ? `<g transform="translate(${badge.x} ${badge.y})"><circle r="17" fill="#fff" stroke="${LINE}"/><g fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${badge.icon}</g></g>`
    : "";
  return `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BG_TOP}"/><stop offset="1" stop-color="${BG_BOTTOM}"/></linearGradient></defs><rect width="320" height="180" fill="url(#${id})"/><rect x="92" y="28" width="136" height="168" rx="14" fill="#fff" stroke="${LINE}"/><g transform="translate(92 28)">${content}</g>${b}</svg>`;
}

const bar = (x: number, y: number, w: number, h = 6, fill = SOFT) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>`;
const pill = (x: number, y: number, w: number, h: number, on = false) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${on ? ACCENT : "#fff"}" stroke="${on ? ACCENT : LINE}"/>`;
const dot = (cx: number, cy: number, r: number, fill = MID) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

const ICON = {
  check: `<path d="M-6 0l4 4 8-9"/>`,
  clock: `<circle r="7"/><path d="M0-4v4l3 2"/>`,
  star: `<path d="M0-7l2.1 4.4 4.8.6-3.5 3.3.9 4.7L0 3.7-4.3 6l.9-4.7L-6.9-2l4.8-.6z"/>`,
  person: `<circle cy="-3" r="3"/><path d="M-6 6c1-4 11-4 12 0"/>`,
  question: `<path d="M-3-3a3 3 0 1 1 4 3c-1 .5-1 1-1 2"/><circle cy="6" r=".6" fill="${INK}"/>`,
  flag: `<path d="M-4 7V-7h8l-2 3 2 3h-8"/>`,
  plate: `<circle r="7"/><circle r="3.5"/>`,
};

export const THUMBS = {
  vereinstermine: frame(
    `${bar(16, 18, 52, 8, MID)}${bar(16, 32, 80)}` +
      Array.from({ length: 4 }, (_, row) =>
        Array.from({ length: 5 }, (_, col) => {
          const on = row === 1 && col === 2;
          return on ? dot(26 + col * 21, 60 + row * 20, 8, ACCENT) : dot(26 + col * 21, 60 + row * 20, 3, MID);
        }).join(""),
      ).join(""),
    { x: 236, y: 46, icon: ICON.check },
  ),
  raumbuchung: frame(
    `${bar(16, 18, 60, 8, MID)}${pill(16, 34, 40, 14)}${pill(60, 34, 40, 14)}` +
      [0, 1, 2].map((r) => [0, 1, 2].map((c) => pill(16 + c * 36, 60 + r * 24, 32, 18, r === 1 && c === 1)).join("")).join(""),
    { x: 236, y: 46, icon: ICON.clock },
  ),
  wochenkarte: frame(
    `${bar(16, 18, 56, 8, MID)}` +
      [0, 1, 2].map((r) => `${dot(28, 54 + r * 34, 11, r === 0 ? ACCENT : SOFT)}${bar(46, 47 + r * 34, 50)}${bar(46, 57 + r * 34, 34, 5)}${bar(104, 51 + r * 34, 18, 6, MID)}`).join(""),
    { x: 236, y: 46, icon: ICON.plate },
  ),
  quiz: frame(
    `${bar(16, 18, 30, 6, MID)}${bar(16, 32, 96, 8, MID)}${bar(16, 46, 70)}` +
      [0, 1, 2].map((r) => pill(16, 66 + r * 24, 104, 18, r === 1)).join("") +
      `<path d="M104 99l3 3 6-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    { x: 236, y: 46, icon: ICON.star },
  ),
  anwesenheit: frame(
    `${bar(16, 18, 64, 8, MID)}` +
      [0, 1, 2, 3].map((r) => {
        const y = 46 + r * 24;
        const done = r < 3;
        return `${dot(26, y, 8, SOFT)}${bar(40, y - 3, 52)}<circle cx="110" cy="${y}" r="7" fill="${r === 0 ? ACCENT : "#fff"}" stroke="${r === 0 ? ACCENT : LINE}"/>${done ? `<path d="M107 ${y}l2 2 4-4" fill="none" stroke="${r === 0 ? "#fff" : INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` : ""}`;
      }).join(""),
    { x: 236, y: 46, icon: ICON.person },
  ),
  festprogramm: frame(
    `${bar(16, 18, 60, 8, MID)}<path d="M26 40v104" stroke="${LINE}" stroke-width="2"/>` +
      [0, 1, 2, 3].map((r) => `${dot(26, 46 + r * 28, r === 1 ? 5 : 4, r === 1 ? ACCENT : MID)}${bar(40, 40 + r * 28, 26, 6, MID)}${bar(40, 50 + r * 28, 70)}`).join(""),
    { x: 236, y: 46, icon: ICON.flag },
  ),
  buergerinfo: frame(
    `${bar(16, 18, 54, 8, MID)}<rect x="16" y="34" width="104" height="18" rx="9" fill="#fff" stroke="${LINE}"/><circle cx="28" cy="43" r="3.5" fill="none" stroke="${ACCENT}" stroke-width="1.6"/>${bar(36, 40, 40, 6)}` +
      [0, 1, 2].map((r) => `<rect x="16" y="${62 + r * 26}" width="104" height="20" rx="8" fill="#fff" stroke="${LINE}"/>${bar(24, 69 + r * 26, 60)}<path d="M108 ${70 + r * 26}l3 3 3-3" fill="none" stroke="${MID}" stroke-width="1.6" stroke-linecap="round"/>`).join(""),
    { x: 236, y: 46, icon: ICON.question },
  ),
} as const;
