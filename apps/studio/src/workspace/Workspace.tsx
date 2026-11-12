import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderBlocks, type Ctx } from '../help/HelpTab';
import { parseMarkdown } from '../help/markdown';
import { approveAction, ChatApiError, createThread, fetchBootstrap, fetchFile, fetchMessages, markRead, rejectAction, sendMessage, transcribe, uploadImage } from './api';
import { markHandled, onDesktopCommand, takePending, type DesktopCommand } from './desktop';
import { BotAvatar } from './BotAvatar';
import { Part, type PartHandlers } from './Parts';
import { applyEvent, emptyThread, optimisticUser, type ThreadView } from './thread-state';
import type { ChatBootstrap, ChatBot, ChatStreamEvent, ChatThread } from './types';

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
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

/** Town-shaped workspace: threads · conversation · document panel. Talks to the same chat API as the app. */
export function Workspace({ token, onSignOut, footer }: { token: string; onSignOut: () => void; footer?: React.ReactNode }) {
  const [boot, setBoot] = useState<ChatBootstrap | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [view, setView] = useState<ThreadView>(emptyThread);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [doc, setDoc] = useState<Doc | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [attachments, setAttachments] = useState<Array<{ url: string; name: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);

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
    fetchMessages(token, threadId)
      .then((r) => alive && setView({ ...emptyThread, messages: r.messages }))
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

  const onEvent = useCallback(
    (tid: string) => (e: ChatStreamEvent) => {
      setView((v) => applyEvent(v, tid, e));
      if (e.type === 'done') {
        setBoot((b) => (b ? { ...b, threads: [e.thread, ...b.threads.filter((t) => t.id !== e.thread.id)] } : b));
      }
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
    setDraft('');
    if (!optionAnswer) setAttachments([]);
    void run(() => sendMessage(token, tid, { text, imageUrls: imageUrls.length ? imageUrls : undefined, optionAnswer }, onEvent(tid)));
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

  // Tray / shortcut commands (compose, dictate, capture). A command sent before mount is taken once.
  useEffect(() => {
    const handle = (c: DesktopCommand) => {
      if (c.kind === 'compose') input.current?.focus();
      else if (c.kind === 'dictate') void toggleDictation();
      else if (c.kind === 'capture') void attach(new Blob([c.bytes], { type: c.type }), c.name);
      else return;
      markHandled();
    };
    const p = takePending();
    if (p) handle(p);
    return onDesktopCommand(handle);
  }, [attach, toggleDictation]);

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
    setDoc({ name, content: null });
    try {
      const r = await fetchFile(token, fileId);
      setDoc({ name: r.file.name, content: r.file.content });
    } catch (e) {
      setDoc({ name, content: null, error: guard(e) });
    }
  };

  const handlers = (messageId: string): PartHandlers => ({
    busy,
    onOption: (key, label) => send(label, { messageId, key }),
    onOpenFile: (id, name) => void openFile(id, name),
    onApprove: (actionId) => threadId && void run(() => approveAction(token, actionId, onEvent(threadId))),
    onReject: (actionId) => threadId && void run(() => rejectAction(token, actionId, onEvent(threadId))),
  });

  const pickable = [...(boot?.presets ?? []), ...(boot?.bots ?? [])];

  return (
    <div className={`ws${doc ? ' with-doc' : ''}`}>
      <aside className="ws-list">
        <div className="ws-list-head">
          <div className="ws-new">
            <button className="btn" onClick={() => setPicker((p) => !p)} disabled={!boot}>
              + Neu
            </button>
            {picker && (
              <div className="ws-picker" role="menu">
                {pickable.map((b) => (
                  <button key={b.id} className="ws-picker-item" role="menuitem" onClick={() => void newThread(b)}>
                    <BotAvatar avatar={b.avatar} size={24} />
                    <span>
                      <strong>{b.name}</strong>
                      <span className="ws-muted">{b.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn ghost" onClick={onSignOut} title="Ortis Studio vom Konto trennen">
            Abmelden
          </button>
        </div>
        {bootError && <div className="ws-error">{bootError}</div>}
        <div className="ws-threads">
          {boot?.threads.map((t: ChatThread) => (
            <button key={t.id} className="ws-thread" aria-selected={t.id === threadId} onClick={() => setThreadId(t.id)}>
              <BotAvatar avatar={t.bots[0]?.avatar} size={30} />
              <span className="ws-thread-text">
                <span className="ws-thread-top">
                  <strong>{t.title || t.bots[0]?.name || 'Unterhaltung'}</strong>
                  <span className="ws-muted">{relTime(t.lastMessageAt)}</span>
                </span>
                <span className="ws-muted ws-ellipsis">{t.lastMessagePreview}</span>
              </span>
              {t.unread && <span className="ws-unread" aria-label="ungelesen" />}
            </button>
          ))}
          {boot && boot.threads.length === 0 && <div className="ws-muted ws-empty">Noch keine Unterhaltung. Starte mit „+ Neu“.</div>}
        </div>
        <div className="ws-quota ws-muted">
          <span>{boot ? `Heute ${Math.round((boot.quota.used / Math.max(1, boot.quota.limit)) * 100)} % genutzt` : ''}</span>
          {footer}
        </div>
      </aside>

      <section className="ws-chat">
        {thread ? (
          <>
            <header className="ws-chat-head">
              <strong>{thread.title || thread.bots[0]?.name}</strong>
              <span className="ws-chat-bots">
                {thread.bots.map((b) => (
                  <BotAvatar key={b.id} avatar={b.avatar} size={20} />
                ))}
              </span>
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
                      <BotAvatar avatar={bot?.avatar} size={30} />
                      <div className="ws-msg-body">
                        <div className="ws-msg-meta">
                          <strong>{bot?.name ?? 'Assistent'}</strong>
                          <span className="ws-muted">{relTime(m.createdAt)}</span>
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
              {(attachments.length > 0 || uploading) && (
                <div className="ws-attachments">
                  {attachments.map((a, i) => (
                    <span key={a.url} className="ws-attachment">
                      <img src={a.url} alt={a.name} />
                      <button type="button" aria-label="Entfernen" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    </span>
                  ))}
                  {uploading && <span className="ws-muted">Lädt hoch …</span>}
                </div>
              )}
              <textarea
                ref={input}
                value={draft}
                placeholder={`Nachricht an ${thread.bots[0]?.name ?? 'deinen Assistenten'}`}
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
              />
              <div className="ws-composer-actions">
                <button
                  type="button"
                  className={`ws-icon-btn${recording ? ' rec' : ''}`}
                  onClick={() => void toggleDictation()}
                  title={recording ? 'Aufnahme beenden' : 'Diktieren'}
                  aria-label={recording ? 'Aufnahme beenden' : 'Diktieren'}
                >
                  {recording ? '■' : '🎙'}
                </button>
                {window.studio?.desktop && (
                  <button
                    type="button"
                    className="ws-icon-btn"
                    onClick={() => void window.studio.desktop?.capture()}
                    title="Bildschirmfoto anhängen"
                    aria-label="Bildschirmfoto anhängen"
                  >
                    ⬚
                  </button>
                )}
                <button className="btn primary" disabled={busy || uploading || (!draft.trim() && attachments.length === 0)}>
                  {busy ? '…' : 'Senden'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="placeholder">{boot ? 'Wähle links eine Unterhaltung oder starte eine neue.' : 'Lade …'}</div>
        )}
      </section>

      {doc && (
        <aside className="ws-doc">
          <header className="ws-doc-head">
            <strong className="ws-ellipsis">{doc.name}</strong>
            <button className="btn ghost" onClick={() => setDoc(null)} aria-label="Schließen">
              ✕
            </button>
          </header>
          <div className="ws-doc-body">
            {doc.error ? (
              <div className="ws-error">{doc.error}</div>
            ) : doc.content === null ? (
              <div className="ws-muted">Lade …</div>
            ) : (
              <div className="ws-md">{renderBlocks(parseMarkdown(doc.content), docCtx)}</div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
