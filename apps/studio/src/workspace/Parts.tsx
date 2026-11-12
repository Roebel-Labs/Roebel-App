import { useMemo } from 'react';
import { renderBlocks, type Ctx } from '../help/HelpTab';
import { parseMarkdown, safeHref } from '../help/markdown';
import type { ChatPart } from './types';

export interface PartHandlers {
  onOption(key: string, label: string): void;
  onOpenFile(fileId: string, name: string): void;
  onApprove(actionId: string): void;
  onReject(actionId: string): void;
  busy: boolean;
}

const open = (href: string) => {
  const safe = safeHref(href);
  if (safe && safe.startsWith('http')) void window.studio.shell.openExternal(safe);
};

const ctx: Ctx = {
  q: '',
  onLink: (e, href) => {
    e.preventDefault();
    open(href);
  },
};

function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className="ws-md">{renderBlocks(blocks, ctx)}</div>;
}

function kb(size: number): string {
  return size >= 1_000_000 ? `${(size / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1000))} KB`;
}

const APPROVAL_STATUS: Record<string, string> = {
  approved: 'Freigegeben',
  executed: 'Erledigt',
  rejected: 'Abgelehnt',
  failed: 'Fehlgeschlagen',
  expired: 'Abgelaufen',
};

export function Part({ part, h }: { part: ChatPart; h: PartHandlers }) {
  switch (part.type) {
    case 'text':
      return <Markdown text={(part as { text: string }).text} />;
    case 'options': {
      const p = part as Extract<ChatPart, { type: 'options' }>;
      const done = p.dismissed || !!p.selected;
      return (
        <div className="ws-options">
          <div className="ws-options-q">{p.question}</div>
          <div className="ws-options-row">
            {p.options.map((o) => (
              <button
                key={o.key}
                className={`ws-chip${p.selected === o.key ? ' on' : ''}`}
                disabled={done || h.busy}
                onClick={() => h.onOption(o.key, o.label)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case 'file': {
      const p = part as Extract<ChatPart, { type: 'file' }>;
      return (
        <button className="ws-file" onClick={() => h.onOpenFile(p.fileId, p.name)}>
          <span className="ws-file-ext">{p.ext.toUpperCase()}</span>
          <span className="ws-file-name">{p.name}</span>
          <span className="w-muted">{kb(p.size)}</span>
        </button>
      );
    }
    case 'image':
    case 'generated_image': {
      const p = part as { url?: string; status?: string; prompt?: string; error?: string };
      if (p.status === 'generating') return <div className="ws-image-wait">Bild wird erstellt …</div>;
      if (p.status === 'failed') return <div className="ws-note">Bild fehlgeschlagen: {p.error ?? 'unbekannt'}</div>;
      return p.url ? <img className="ws-image" src={p.url} alt={p.prompt ?? ''} /> : null;
    }
    case 'sources': {
      const p = part as Extract<ChatPart, { type: 'sources' }>;
      return (
        <div className="ws-sources">
          {p.items.map((s, i) => (
            <button key={i} className="ws-source" onClick={() => open(s.url)} title={s.url}>
              {s.title || s.url}
            </button>
          ))}
        </div>
      );
    }
    case 'approval': {
      const p = part as Extract<ChatPart, { type: 'approval' }>;
      return (
        <div className="ws-approval">
          <div className="ws-approval-head">
            <strong>{p.title}</strong>
            {p.status !== 'pending' && <span className="ws-tag">{APPROVAL_STATUS[p.status] ?? p.status}</span>}
          </div>
          <div className="w-muted">{p.summary}</div>
          {p.preview.fields.length > 0 && (
            <dl className="ws-fields">
              {p.preview.fields.map((f, i) => (
                <div key={i}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {p.preview.body && <div className="ws-approval-body">{p.preview.body}</div>}
          {p.resultNote && <div className="w-muted">{p.resultNote}</div>}
          {p.status === 'pending' &&
            (p.risk === 'money' ? (
              <div className="ws-note">Zahlungen bestätigst du in der Röbel App.</div>
            ) : (
              <div className="ws-approval-actions">
                <button className="w-btn green" disabled={h.busy} onClick={() => h.onApprove(p.actionId)}>
                  Freigeben
                </button>
                <button className="w-btn" disabled={h.busy} onClick={() => h.onReject(p.actionId)}>
                  Ablehnen
                </button>
              </div>
            ))}
        </div>
      );
    }
    case 'task': {
      const p = part as Extract<ChatPart, { type: 'task' }>;
      return (
        <div className="ws-task">
          <strong>{p.title}</strong>
          <ol>
            {p.steps.map((s, i) => (
              <li key={i} className={`ws-step ${s.status}`}>
                {s.label}
              </li>
            ))}
          </ol>
        </div>
      );
    }
    case 'calendar_event': {
      const p = part as Extract<ChatPart, { type: 'calendar_event' }>;
      const d = new Date(p.start);
      return (
        <div className="ws-event">
          <strong>{p.title}</strong>
          <span className="w-muted">
            {d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })},{' '}
            {d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            {p.location ? ` · ${p.location}` : ''}
          </span>
        </div>
      );
    }
    default:
      return <div className="ws-note">Dieser Inhalt wird in der Röbel App angezeigt.</div>;
  }
}
