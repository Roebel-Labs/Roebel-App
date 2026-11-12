import { useMemo, useRef, useState, type ReactNode } from 'react';
import guide from '../../../../docs/STUDIO_RUNBOOK.md?raw';
import { parseMarkdown, safeHref, toSections, type Block, type Inline, type Section } from './markdown';
import './help.css';

/** Highlights case-insensitive matches of `q` inside plain text. */
function mark(text: string, q: string, key: string): ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let at = 0;
  for (let idx = lower.indexOf(q); idx >= 0; idx = lower.indexOf(q, at)) {
    if (idx > at) parts.push(text.slice(at, idx));
    parts.push(<mark key={`${key}-${idx}`}>{text.slice(idx, idx + q.length)}</mark>);
    at = idx + q.length;
  }
  parts.push(text.slice(at));
  return parts;
}

export interface Ctx {
  q: string;
  onLink: (e: { preventDefault(): void }, href: string) => void;
}

function renderInline(nodes: Inline[], ctx: Ctx, key = 'i'): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    switch (n.t) {
      case 'text':
        return <span key={k}>{mark(n.v, ctx.q, k)}</span>;
      case 'code':
        return <code key={k}>{mark(n.v, ctx.q, k)}</code>;
      case 'strong':
        return <strong key={k}>{renderInline(n.c, ctx, k)}</strong>;
      case 'em':
        return <em key={k}>{renderInline(n.c, ctx, k)}</em>;
      case 'link':
        return (
          <a key={k} href={n.href} onClick={(e) => ctx.onLink(e, n.href)}>
            {renderInline(n.c, ctx, k)}
          </a>
        );
    }
  });
}

export function renderBlocks(blocks: Block[], ctx: Ctx, key = 'b'): ReactNode[] {
  return blocks.map((b, i) => {
    const k = `${key}.${i}`;
    switch (b.t) {
      case 'heading': {
        const Tag = `h${b.level}` as 'h1' | 'h2' | 'h3' | 'h4';
        return (
          <Tag key={k} id={b.id}>
            {renderInline(b.c, ctx, k)}
          </Tag>
        );
      }
      case 'p':
        return <p key={k}>{renderInline(b.c, ctx, k)}</p>;
      case 'list': {
        const Tag = b.ordered ? 'ol' : 'ul';
        return (
          <Tag key={k} className={b.items.some((it) => it.checked !== null) ? 'checks' : undefined}>
            {b.items.map((it, j) => (
              <li key={j}>
                {it.checked !== null && <span aria-hidden="true">{it.checked ? '☑ ' : '☐ '}</span>}
                {renderInline(it.c, ctx, `${k}.${j}`)}
              </li>
            ))}
          </Tag>
        );
      }
      case 'code':
        return (
          <pre key={k}>
            <code>{b.v}</code>
          </pre>
        );
      case 'quote':
        return <blockquote key={k}>{renderBlocks(b.blocks, ctx, k)}</blockquote>;
      case 'table':
        return (
          <div className="help-table" key={k}>
            <table>
              <thead>
                <tr>
                  {b.head.map((c, j) => (
                    <th key={j}>{renderInline(c, ctx, `${k}.h${j}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, m) => (
                      <td key={m}>{renderInline(c, ctx, `${k}.${j}.${m}`)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'hr':
        return <hr key={k} />;
    }
  });
}

/** The presentational part, separate from the bundled guide so it can be tested with any markdown. */
export function HelpView({ source }: { source: string }) {
  const sections = useMemo<Section[]>(() => toSections(parseMarkdown(source)), [source]);
  const [query, setQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();
  const visible = q ? sections.filter((s) => s.haystack.includes(q)) : sections;

  const jump = (id: string) => {
    const el = contentRef.current?.querySelector(`[id="${id}"]`);
    if (el && 'scrollIntoView' in el) (el as HTMLElement).scrollIntoView({ block: 'start' });
  };

  const ctx: Ctx = {
    q,
    onLink: (e, href) => {
      e.preventDefault();
      const safe = safeHref(href);
      if (!safe) return;
      if (safe.startsWith('#')) jump(safe.slice(1));
      else void window.studio?.shell?.openExternal(safe);
    },
  };

  return (
    <div className="help">
      <aside className="help-toc" aria-label="Inhalt">
        <input
          className="help-search"
          type="search"
          placeholder="In der Hilfe suchen …"
          aria-label="In der Hilfe suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <nav>
          {visible.length === 0 && <p className="help-empty">Nichts gefunden.</p>}
          {visible.map((s) => (
            <div key={s.id}>
              <a href={`#${s.id}`} className="toc-h2" onClick={(e) => ctx.onLink(e, `#${s.id}`)}>
                {s.title}
              </a>
              {s.subs.map((sub) => (
                <a key={sub.id} href={`#${sub.id}`} className="toc-h3" onClick={(e) => ctx.onLink(e, `#${sub.id}`)}>
                  {sub.title}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <article className="help-content" ref={contentRef}>
        {visible.map((s) => (
          <section key={s.id} id={s.blocks[0]?.t === 'heading' && s.blocks[0].level === 2 ? undefined : s.id}>
            {renderBlocks(s.blocks, ctx, s.id)}
          </section>
        ))}
      </article>
    </div>
  );
}

export function HelpTab() {
  return <HelpView source={guide} />;
}
