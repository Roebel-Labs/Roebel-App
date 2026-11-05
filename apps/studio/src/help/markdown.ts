// Tiny dependency-free markdown parser for the bundled help guide. It produces a plain data tree
// (never HTML), so the renderer builds React elements and raw HTML in the source stays text.
// Subset: # headings, paragraphs, - / 1. lists (incl. - [ ] checkboxes), ``` code, > quotes, tables,
// ---, and inline `code`, **bold**, *italic*, [text](url).

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] };

export type Block =
  | { t: 'heading'; level: 1 | 2 | 3 | 4; id: string; c: Inline[]; text: string }
  | { t: 'p'; c: Inline[] }
  | { t: 'list'; ordered: boolean; items: Array<{ checked: boolean | null; c: Inline[] }> }
  | { t: 'code'; lang: string; v: string }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' };

/** Only http(s) links and in-page anchors are ever active. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https?:\/\/[^\s]+$/i.test(h)) return h;
  if (/^#[\w-]+$/.test(h)) return h;
  return null;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'abschnitt'
  );
}

export function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : inlineText(n.c))).join('');
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length && /[\\`*_[\]()#|-]/.test(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push({ t: 'code', v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'strong', c: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (ch === '*' && src[i + 1] !== ' ' && src[i + 1] !== '*') {
      const end = src.indexOf('*', i + 1);
      if (end > i + 1 && src[end - 1] !== ' ') {
        flush();
        out.push({ t: 'em', c: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        const href = safeHref(m[2]);
        flush();
        const c = parseInline(m[1]);
        if (href) out.push({ t: 'link', href, c });
        else out.push(...c); // unsafe target: keep the words, drop the link
        i += m[0].length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

const splitRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');
const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const used = new Map<string, number>();
  const uniqueId = (text: string) => {
    const base = slugify(text);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };

  const parse = (ls: string[]): Block[] => {
    const blocks: Block[] = [];
    let i = 0;
    while (i < ls.length) {
      const line = ls[i];
      if (!line.trim()) {
        i++;
        continue;
      }
      const fence = /^\s*```(.*)$/.exec(line);
      if (fence) {
        const body: string[] = [];
        i++;
        while (i < ls.length && !/^\s*```\s*$/.test(ls[i])) body.push(ls[i++]);
        i++; // closing fence
        blocks.push({ t: 'code', lang: fence[1].trim(), v: body.join('\n') });
        continue;
      }
      const h = /^(#{1,4})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h) {
        const c = parseInline(h[2]);
        const text = inlineText(c);
        blocks.push({ t: 'heading', level: h[1].length as 1 | 2 | 3 | 4, id: uniqueId(text), c, text });
        i++;
        continue;
      }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
        blocks.push({ t: 'hr' });
        i++;
        continue;
      }
      if (/^\s*>/.test(line)) {
        const q: string[] = [];
        while (i < ls.length && /^\s*>/.test(ls[i])) q.push(ls[i++].replace(/^\s*>\s?/, ''));
        blocks.push({ t: 'quote', blocks: parse(q) });
        continue;
      }
      if (line.includes('|') && i + 1 < ls.length && isTableSep(ls[i + 1])) {
        const head = splitRow(line).map(parseInline);
        i += 2;
        const rows: Inline[][][] = [];
        while (i < ls.length && ls[i].trim() && ls[i].includes('|')) rows.push(splitRow(ls[i++]).map(parseInline));
        blocks.push({ t: 'table', head, rows });
        continue;
      }
      const li = LIST_RE.exec(line);
      if (li) {
        const ordered = /\d/.test(li[2]);
        const items: Array<{ checked: boolean | null; c: Inline[] }> = [];
        while (i < ls.length) {
          const m = LIST_RE.exec(ls[i]);
          if (!m || /\d/.test(m[2]) !== ordered) break;
          let text = m[3];
          i++;
          // Continuation lines: indented, non-empty, not a new item.
          while (i < ls.length && /^\s+\S/.test(ls[i]) && !LIST_RE.exec(ls[i])) text += ' ' + ls[i++].trim();
          let checked: boolean | null = null;
          const cb = /^\[( |x|X)\]\s+(.*)$/.exec(text);
          if (cb) {
            checked = cb[1] !== ' ';
            text = cb[2];
          }
          items.push({ checked, c: parseInline(text) });
        }
        blocks.push({ t: 'list', ordered, items });
        continue;
      }
      // Paragraph: until blank line or another block start.
      const para: string[] = [];
      while (
        i < ls.length &&
        ls[i].trim() &&
        !/^\s*(```|#{1,4}\s|>)/.test(ls[i]) &&
        !LIST_RE.exec(ls[i]) &&
        !/^\s*(-{3,}|\*{3,})\s*$/.test(ls[i])
      )
        para.push(ls[i++].trim());
      if (para.length === 0) {
        i++; // cannot happen, but never loop forever
        continue;
      }
      blocks.push({ t: 'p', c: parseInline(para.join(' ')) });
    }
    return blocks;
  };
  return parse(lines);
}

export interface Section {
  id: string;
  title: string;
  /** h3 children for the table of contents. */
  subs: Array<{ id: string; title: string }>;
  blocks: Block[];
  /** Plain text of the whole section, lowercase, for searching. */
  haystack: string;
}

export function blockText(b: Block): string {
  switch (b.t) {
    case 'heading':
      return b.text;
    case 'p':
      return inlineText(b.c);
    case 'list':
      return b.items.map((it) => inlineText(it.c)).join(' ');
    case 'code':
      return b.v;
    case 'quote':
      return b.blocks.map(blockText).join(' ');
    case 'table':
      return [...b.head, ...b.rows.flat()].map(inlineText).join(' ');
    default:
      return '';
  }
}

/** Splits the document into one section per h2 (an h1 and anything before the first h2 form the intro). */
export function toSections(blocks: Block[]): Section[] {
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const b of blocks) {
    if (b.t === 'heading' && b.level === 2) {
      cur = { id: b.id, title: b.text, subs: [], blocks: [b], haystack: '' };
      sections.push(cur);
      continue;
    }
    if (!cur) {
      cur = { id: 'einleitung', title: 'Einleitung', subs: [], blocks: [], haystack: '' };
      sections.push(cur);
    }
    if (b.t === 'heading' && b.level === 3) cur.subs.push({ id: b.id, title: b.text });
    cur.blocks.push(b);
  }
  for (const s of sections) s.haystack = s.blocks.map(blockText).join(' ').toLowerCase();
  return sections;
}
