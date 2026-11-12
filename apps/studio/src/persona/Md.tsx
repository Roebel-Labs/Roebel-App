// Markdown for wiki pages, updates and library documents. Built on the dependency-free parser of the help
// guide (a data tree, never HTML), plus `[[n]]` citation marks and `[Text](wiki:slug)` internal links.
import { useMemo, type ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from '../help/markdown';
import type { PageSource } from '../workspace/api';
import { openExternal } from './common';
import { fmtDate, prepareWikiMarkdown, splitCitations, wikiSlugOf } from './format';

interface Ctx {
  sources?: PageSource[];
  onWiki?: (slug: string) => void;
}

function text(v: string, ctx: Ctx, key: string): ReactNode {
  if (!ctx.sources) return v;
  const parts = splitCitations(v);
  if (parts.length === 1 && typeof parts[0] === 'string') return v;
  return parts.map((p, i) => {
    if (typeof p === 'string') return <span key={`${key}.${i}`}>{p}</span>;
    const src = ctx.sources?.find((s) => s.n === p.n) ?? ctx.sources?.[p.n - 1];
    const tip = src ? [src.label, fmtDate(src.date)].filter(Boolean).join(' · ') : 'Quelle unbekannt';
    return (
      <sup key={`${key}.${i}`} className="pz-cite" data-tip={tip} aria-label={`Quelle ${p.n}: ${tip}`} tabIndex={0}>
        {p.n}
      </sup>
    );
  });
}

function inline(nodes: Inline[], ctx: Ctx, key: string): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    switch (n.t) {
      case 'text':
        return <span key={k}>{text(n.v, ctx, k)}</span>;
      case 'code':
        return <code key={k}>{n.v}</code>;
      case 'strong':
        return <strong key={k}>{inline(n.c, ctx, k)}</strong>;
      case 'em':
        return <em key={k}>{inline(n.c, ctx, k)}</em>;
      case 'link': {
        const slug = wikiSlugOf(n.href);
        return (
          <a
            key={k}
            href={n.href}
            onClick={(e) => {
              e.preventDefault();
              if (slug) ctx.onWiki?.(slug);
              else openExternal(n.href);
            }}
          >
            {inline(n.c, ctx, k)}
          </a>
        );
      }
    }
  });
}

function blocks(list: Block[], ctx: Ctx, key: string): ReactNode[] {
  return list.map((b, i) => {
    const k = `${key}.${i}`;
    switch (b.t) {
      case 'heading': {
        // Page titles are h1 in the layout, so body headings start one level lower.
        const Tag = `h${Math.min(4, b.level + 1)}` as 'h2' | 'h3' | 'h4';
        return <Tag key={k}>{inline(b.c, ctx, k)}</Tag>;
      }
      case 'p':
        return <p key={k}>{inline(b.c, ctx, k)}</p>;
      case 'list': {
        const Tag = b.ordered ? 'ol' : 'ul';
        return (
          <Tag key={k}>
            {b.items.map((it, j) => (
              <li key={j}>
                {it.checked !== null && <span aria-hidden="true">{it.checked ? '☑ ' : '☐ '}</span>}
                {inline(it.c, ctx, `${k}.${j}`)}
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
        return <blockquote key={k}>{blocks(b.blocks, ctx, k)}</blockquote>;
      case 'table':
        return (
          <div className="pz-md-table" key={k}>
            <table>
              <thead>
                <tr>
                  {b.head.map((c, j) => (
                    <th key={j}>{inline(c, ctx, `${k}.h${j}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, m) => (
                      <td key={m}>{inline(c, ctx, `${k}.${j}.${m}`)}</td>
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

export function Md({ source, sources, onWiki, className }: { source: string; sources?: PageSource[]; onWiki?: (slug: string) => void; className?: string }) {
  const tree = useMemo(() => parseMarkdown(prepareWikiMarkdown(source)), [source]);
  return <div className={`ws-md pz-md${className ? ` ${className}` : ''}`}>{blocks(tree, { sources, onWiki }, 'm')}</div>;
}

/** One line of markdown (an update entry) without block wrappers. */
export function MdInline({ source, onWiki }: { source: string; onWiki?: (slug: string) => void }) {
  const tree = useMemo(() => parseMarkdown(prepareWikiMarkdown(source)), [source]);
  const ctx: Ctx = { onWiki };
  return (
    <>
      {tree.map((b, i) =>
        b.t === 'p' ? <span key={i}>{inline(b.c, ctx, `u${i}`)} </span> : b.t === 'heading' ? <strong key={i}>{inline(b.c, ctx, `u${i}`)} </strong> : <span key={i}>{blocks([b], ctx, `u${i}`)}</span>,
      )}
    </>
  );
}
