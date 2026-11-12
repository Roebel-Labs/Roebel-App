import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderBlocks, type Ctx } from '../help/HelpTab';
import { parseMarkdown } from '../help/markdown';
import {
  IconAt, IconCapture, IconChevronDown, IconClose, IconFile, IconLogout, IconMic, IconPanelRight, IconPlus, IconSearch,
  IconSend, IconStop, IconWave,
} from '../ui/shell/line-icons';
import { approveAction, ChatApiError, createThread, fetchBootstrap, fetchFile, fetchMessages, markRead, rejectAction, sendMessage, transcribe, uploadImage } from './api';
import { BotAvatar } from './BotAvatar';
import { markHandled, onDesktopCommand, takePending, type DesktopCommand } from './desktop';
import { Part, type PartHandlers } from './Parts';
import { applyEvent, emptyThread, optimisticUser, type ThreadView } from './thread-state';
import type { ChatBootstrap, ChatBot, ChatMessage, ChatPart, ChatStreamEvent, ChatThread } from './types';

type Doc = { name: string; content: string | null; error?: string };

const docCtx: Ctx = {
  q: '',
  onLink: (e, href) => {
    e.preventDefault();
    if (/^https?:\/\//.test(href)) void window.studio.shell.openExternal(href);
  },
};

function relTime(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function textOf(m: ChatMessage | undefined): string {
  if (!m) return '';
  for (const p of m.parts) if (p.type === 'text') return String((p as { text: string }).text).replace(/[#*_`>]/g, '').trim();
  return '';
}

/** Open option chips of the newest bot message (Town's suggestion row above the composer). */
function suggestions(messages: ChatMessage[]): { messageId: string; key: string; label: string }[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') return [];
    const opt = m.parts.find((p) => p.type === 'options') as Extract<ChatPart, { type: 'options' }> | undefined;
    if (opt) return opt.dismissed || opt.selected ? [] : opt.options.map((o) => ({ messageId: m.id, key: o.key, label: o.label }));
  }
  return [];
}

/** Files and images in a thread, newest first (the "Bibliothek" panel). */
function library(messages: ChatMessage[]): Array<{ kind: 'file'; id: string; name: string } | { kind: 'image'; url: string; name: string }> {
  const out: Array<{ kind: 'file'; id: string; name: string } | { kind: 'image'; url: string; name: string }> = [];
  for (const m of [...messages].reverse())
    for (const p of m.parts) {
      if (p.type === 'file') out.push({ kind: 'file', id: (p as { fileId: string }).fileId, name: (p as { name: string }).name });
      else if ((p.type === 'image' || p.type === 'generated_image') && (p as { url?: string }).url)
        out.push({ kind: 'image', url: (p as { url: string }).url, name: (p as { prompt?: string }).prompt?.slice(0, 60) || 'Bild' });
    }
  return out;
}

/** Town-shaped workspace: list · conversation · Bibliothek. Same chat API as the Röbel app. */
export function Workspace({ token, onSignOut, footer }: { token: string; onSignOut: () => void; footer?: React.ReactNode }) {
  const [boot, setBoot] = useState<ChatBootstrap | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [view, setView] = useState<ThreadView>(emptyThread);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [attachments, setAttachments] = useState<Array<{ url: string; name: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  // "openThread" command (Für dich → Starten): the first message waits until the thread's history is loaded.
  const firstMessage = useRef<{ threadId: string; text: string } | null>(null);
  const sendFirst = useRef<(threadId: string, text: string) => void>(() => {});
  const currentThread = useRef<string | null>(null);
  currentThread.current = threadId;

  const guard = useCallback(
    (e: unknown): string => {
      if (e instanceof ChatApiError && e.status === 401) onSignOut();
      return (e as Error).message;
    },
    [onSignOut],
  );

  const reload = useCallback(async () => {
    try {
      const b = await fetchBootstrap(token);
      setBoot(b);
      setBootError(null);
      setThreadId((cur) => cur ?? b.threads[0]?.id ?? null);
    } catch (e) {
      setBootError(guard(e));
    }
  }, [token, guard]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!threadId) return;
    let alive = true;
    setView(emptyThread);
    setDoc(null);
    fetchMessages(token, threadId)
      .then((r) => {
        if (!alive) return;
        setView({ ...emptyThread, messages: r.messages });
        const first = firstMessage.current;
        if (first && first.threadId === threadId) {
          firstMessage.current = null;
          sendFirst.current(threadId, first.text);
        }
      })
      .catch((e) => alive && setView({ ...emptyThread, error: guard(e) }));
    void markRead(token, threadId).catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, threadId, guard]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [view.messages]);

  const thread = boot?.threads.find((t) => t.id === threadId) ?? null;
  const botsById = useMemo(() => {
    const m = new Map<string, ChatBot>();
    for (const b of [...(boot?.presets ?? []), ...(boot?.bots ?? []), ...(thread?.bots ?? [])]) m.set(b.id, b);
    return m;
  }, [boot, thread]);
  const leadBot = thread?.bots[0] ?? boot?.presets[0];
  const lastBotMsg = [...view.messages].reverse().find((m) => m.role === 'bot');
  const chips = suggestions(view.messages);
  const lib = library(view.messages);

  const onEvent = useCallback(
    (tid: string) => (e: ChatStreamEvent) => {
      setView((v) => applyEvent(v, tid, e));
      if (e.type === 'done') setBoot((b) => (b ? { ...b, threads: [e.thread, ...b.threads.filter((t) => t.id !== e.thread.id)] } : b));
    },
    [],
  );

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setView((v) => ({ ...v, streaming: [], error: guard(e) }));
    } finally {
      setBusy(false);
    }
  };

  const send = (raw: string, optionAnswer?: { messageId: string; key: string }) => {
    const imageUrls = optionAnswer ? [] : attachments.map((a) => a.url);
    const text = raw.trim() || (imageUrls.length ? 'Schau dir das bitte an.' : '');
    if (!threadId || !text || busy || uploading) return;
    const tid = threadId;
    setView((v) => ({ ...v, error: null, messages: [...v.messages, optimisticUser(tid, text)] }));
    if (!optionAnswer) {
      setDraft('');
      setAttachments([]);
    }
    void run(() => sendMessage(token, tid, { text, imageUrls: imageUrls.length ? imageUrls : undefined, optionAnswer }, onEvent(tid)));
  };

  sendFirst.current = (tid, text) => {
    setView((v) => ({ ...v, error: null, messages: [...v.messages, optimisticUser(tid, text)] }));
    void run(() => sendMessage(token, tid, { text }, onEvent(tid)));
  };

  const newThread = async (bot: ChatBot) => {
    setPicker(false);
    try {
      const r = await createThread(token, [bot.id]);
      setBoot((b) => (b ? { ...b, threads: [r.thread, ...b.threads] } : b));
      setThreadId(r.thread.id);
      setView({ ...emptyThread, messages: r.messages });
    } catch (e) {
      setBootError(guard(e));
    }
  };

  const openFile = async (fileId: string, name: string) => {
    setPanelOpen(true);
    setDoc({ name, content: null });
    try {
      const r = await fetchFile(token, fileId);
      setDoc({ name: r.file.name, content: r.file.content });
    } catch (e) {
      setDoc({ name, content: null, error: guard(e) });
    }
  };

  const attach = useCallback(
    async (blob: Blob, name: string) => {
      setUploading(true);
      try {
        const r = await uploadImage(token, blob, name);
        setAttachments((a) => [...a, { url: r.url, name }]);
      } catch (e) {
        setView((v) => ({ ...v, error: guard(e) }));
      } finally {
        setUploading(false);
      }
    },
    [token, guard],
  );

  const toggleDictation = useCallback(async () => {
    if (recorder.current) {
      recorder.current.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        setRecording(false);
        try {
          const { text } = await transcribe(token, new Blob(chunks, { type: 'audio/webm' }));
          if (text) setDraft((d) => (d ? `${d} ${text}` : text));
          input.current?.focus();
        } catch (e) {
          setView((v) => ({ ...v, error: guard(e) }));
        }
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setView((v) => ({ ...v, error: 'Kein Zugriff aufs Mikrofon. Systemeinstellungen → Datenschutz → Mikrofon.' }));
    }
  }, [token, guard]);

  // Tray, shortcut and toolbar commands. A command sent before mount is taken once.
  useEffect(() => {
    const handle = (c: DesktopCommand) => {
      if (c.kind === 'compose') input.current?.focus();
      else if (c.kind === 'dictate') void toggleDictation();
      else if (c.kind === 'capture') void attach(new Blob([c.bytes], { type: c.type }), c.name);
      else if (c.kind === 'toggleList') setListOpen((o) => !o);
      else if (c.kind === 'openThread') {
        const text = c.message?.trim();
        if (text && currentThread.current === c.threadId) sendFirst.current(c.threadId, text);
        else if (text) firstMessage.current = { threadId: c.threadId, text };
        setThreadId(c.threadId);
        void reload(); // the thread was created elsewhere: fetch it into the list
      }
      else if (c.kind === 'search') {
        setListOpen(true);
        setSearch((s) => s ?? '');
        setTimeout(() => searchInput.current?.focus(), 0);
      } else return;
      markHandled();
    };
    const p = takePending();
    if (p) handle(p);
    return onDesktopCommand(handle);
  }, [attach, toggleDictation, reload]);

  const handlers = (messageId: string): PartHandlers => ({
    busy,
    onOption: (key, label) => send(label, { messageId, key }),
    onOpenFile: (id, name) => void openFile(id, name),
    onApprove: (actionId) => threadId && void run(() => approveAction(token, actionId, onEvent(threadId))),
    onReject: (actionId) => threadId && void run(() => rejectAction(token, actionId, onEvent(threadId))),
  });

  const pickable = [...(boot?.presets ?? []), ...(boot?.bots ?? [])];
  const q = (search ?? '').trim().toLowerCase();
  const threads = (boot?.threads ?? []).filter(
    (t: ChatThread) => !q || `${t.title} ${t.lastMessagePreview} ${t.bots.map((b) => b.name).join(' ')}`.toLowerCase().includes(q),
  );
  const streaming = view.streaming.length > 0;

  return (
    <div className={`ws${listOpen ? '' : ' no-list'}${panelOpen ? ' with-panel' : ''}`}>
      {listOpen && (
        <aside className="ws-list">
          <div className={`ws-agent${streaming ? ' running' : ''}`}>
            <BotAvatar avatar={leadBot?.avatar} size={40} />
            <div className="ws-agent-text">
              <span className="ws-agent-name">{(leadBot?.name ?? 'Mecky').toUpperCase()}</span>
              <span className="ws-agent-status">{streaming ? 'Arbeitet …' : textOf(lastBotMsg) || 'Bereit'}</span>
            </div>
            {streaming && <span className="ws-spinner" aria-label="arbeitet" />}
          </div>

          <div className="ws-list-tools">
            <div className="ws-new">
              <button className="w-pill" onClick={() => setPicker((p) => !p)} disabled={!boot}>
                <IconPlus size={16} /> Neu <IconChevronDown size={14} />
              </button>
              {picker && (
                <div className="ws-picker" role="menu">
                  {pickable.map((b) => (
                    <button key={b.id} className="ws-picker-item" role="menuitem" onClick={() => void newThread(b)}>
                      <BotAvatar avatar={b.avatar} size={26} />
                      <span>
                        <strong>{b.name}</strong>
                        <span className="w-muted">{b.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className={`w-round${recording ? ' rec' : ''}`} title="Aufnehmen" aria-label="Aufnehmen" onClick={() => void toggleDictation()}>
              <IconWave size={16} />
            </button>
            <span className="ws-tools-spacer" />
            <button
              className="w-icon"
              title="Suchen"
              aria-label="Suchen"
              onClick={() => {
                setSearch((s) => (s === null ? '' : null));
                setTimeout(() => searchInput.current?.focus(), 0);
              }}
            >
              <IconSearch size={17} />
            </button>
          </div>
          {search !== null && (
            <input
              ref={searchInput}
              className="ws-search"
              placeholder="Unterhaltungen durchsuchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSearch(null)}
            />
          )}

          {bootError && <div className="ws-error">{bootError}</div>}
          <div className="ws-threads">
            <div className="ws-group">Zuletzt verwendet</div>
            {threads.map((t) => (
              <button key={t.id} className="ws-thread" aria-selected={t.id === threadId} onClick={() => setThreadId(t.id)} title={t.lastMessagePreview}>
                <span className="w-ellipsis">{t.title || t.bots[0]?.name || 'Unterhaltung'}</span>
                {t.unread && <span className="ws-unread" aria-label="ungelesen" />}
              </button>
            ))}
            {boot && threads.length === 0 && <div className="ws-empty">{q ? 'Nichts gefunden.' : 'Noch keine Unterhaltung. Starte mit „Neu“.'}</div>}
          </div>

          <div className="ws-list-foot">
            <span className="w-muted">{boot ? `Heute ${Math.round((boot.quota.used / Math.max(1, boot.quota.limit)) * 100)} % genutzt` : ''}</span>
            {footer}
            <button className="w-icon" onClick={onSignOut} title="Abmelden" aria-label="Abmelden">
              <IconLogout size={16} />
            </button>
          </div>
        </aside>
      )}

      <section className="ws-chat">
        {thread ? (
          <>
            <header className="ws-chat-head">
              <BotAvatar avatar={leadBot?.avatar} size={30} />
              <strong className="w-ellipsis">{thread.title || leadBot?.name}</strong>
              <span className="ws-tools-spacer" />
              <button className={`w-icon${panelOpen ? ' on' : ''}`} title="Bibliothek" aria-label="Bibliothek" onClick={() => setPanelOpen((o) => !o)}>
                <IconPanelRight size={18} />
              </button>
            </header>
            <div className="ws-messages" ref={scroller}>
              <div className="ws-messages-inner">
                {view.messages.map((m) => {
                  const bot = m.botId ? botsById.get(m.botId) : undefined;
                  if (m.role === 'user')
                    return (
                      <div key={m.id} className="ws-msg user">
                        {m.parts.map((p, i) => (
                          <Part key={i} part={p} h={handlers(m.id)} />
                        ))}
                      </div>
                    );
                  return (
                    <div key={m.id} className="ws-msg bot">
                      <BotAvatar avatar={bot?.avatar} size={28} />
                      <div className="ws-msg-body">
                        <div className="ws-msg-meta">
                          <strong>{bot?.name ?? 'Assistent'}</strong>
                          <span className="w-muted">{relTime(m.createdAt)}</span>
                        </div>
                        {m.parts.map((p, i) => (
                          <Part key={i} part={p} h={handlers(m.id)} />
                        ))}
                        {view.streaming.includes(m.id) && m.parts.length === 0 && <span className="ws-typing">schreibt …</span>}
                      </div>
                    </div>
                  );
                })}
                {view.error && <div className="ws-error">{view.error}</div>}
              </div>
            </div>

            <form
              className="ws-composer"
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
            >
              {chips.length > 0 && (
                <div className="ws-chips">
                  {chips.map((c) => (
                    <button key={c.key} type="button" className="ws-chip" disabled={busy} onClick={() => send(c.label, { messageId: c.messageId, key: c.key })}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
              {(attachments.length > 0 || uploading) && (
                <div className="ws-attachments">
                  {attachments.map((a, i) => (
                    <span key={a.url} className="ws-attachment">
                      <img src={a.url} alt={a.name} />
                      <button type="button" aria-label="Entfernen" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}>
                        <IconClose size={10} />
                      </button>
                    </span>
                  ))}
                  {uploading && <span className="w-muted">Lädt hoch …</span>}
                </div>
              )}
              <textarea
                ref={input}
                value={draft}
                placeholder={`Schreib ${leadBot?.name ?? 'deinem Assistenten'} oder sprich mit ihm`}
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
              />
              <div className="ws-composer-row">
                <button type="button" className="w-icon" title="Erwähnen" aria-label="Erwähnen" onClick={() => setDraft((d) => `${d}@`)}>
                  <IconAt size={18} />
                </button>
                {window.studio?.desktop && (
                  <button type="button" className="w-icon" title="Bildschirmfoto anhängen" aria-label="Bildschirmfoto anhängen" onClick={() => void window.studio.desktop?.capture()}>
                    <IconCapture size={18} />
                  </button>
                )}
                <span className="ws-tools-spacer" />
                <button
                  type="button"
                  className={`w-circle ink${recording ? ' rec' : ''}`}
                  onClick={() => void toggleDictation()}
                  title={recording ? 'Aufnahme beenden' : 'Diktieren'}
                  aria-label={recording ? 'Aufnahme beenden' : 'Diktieren'}
                >
                  {recording ? <IconStop size={16} /> : <IconMic size={17} />}
                </button>
                <button className="w-circle green" disabled={busy || uploading || (!draft.trim() && attachments.length === 0)} title="Senden" aria-label="Senden">
                  {busy ? <span className="ws-spinner light" /> : <IconSend size={17} />}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="placeholder">{boot ? 'Wähle links eine Unterhaltung oder starte eine neue.' : 'Lade …'}</div>
        )}
      </section>

      {panelOpen && (
        <aside className="ws-panel">
          <div className="ws-panel-card">
            {doc ? (
              <>
                <header className="ws-panel-head">
                  <button className="w-icon" onClick={() => setDoc(null)} aria-label="Zurück zur Bibliothek">
                    ←
                  </button>
                  <strong className="w-ellipsis">{doc.name}</strong>
                </header>
                <div className="ws-doc-body">
                  {doc.error ? (
                    <div className="ws-error">{doc.error}</div>
                  ) : doc.content === null ? (
                    <div className="w-muted">Lade …</div>
                  ) : (
                    <div className="ws-md">{renderBlocks(parseMarkdown(doc.content), docCtx)}</div>
                  )}
                </div>
              </>
            ) : (
              <>
                <header className="ws-panel-head">
                  <strong>Bibliothek</strong>
                </header>
                <div className="ws-lib">
                  {lib.length === 0 && <div className="w-muted ws-empty">Dateien und Bilder aus dieser Unterhaltung erscheinen hier.</div>}
                  {lib.map((it, i) =>
                    it.kind === 'file' ? (
                      <button key={i} className="ws-lib-item" onClick={() => void openFile(it.id, it.name)}>
                        <IconFile size={16} />
                        <span className="w-ellipsis">{it.name}</span>
                      </button>
                    ) : (
                      <button key={i} className="ws-lib-item" onClick={() => void window.studio.shell.openExternal(it.url)}>
                        <img src={it.url} alt="" />
                        <span className="w-ellipsis">{it.name}</span>
                      </button>
                    ),
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
