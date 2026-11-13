import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderBlocks, type Ctx } from '../help/HelpTab';
import { parseMarkdown } from '../help/markdown';
import {
  IconAt, IconCapture, IconChevronDown, IconClose, IconCopy, IconFile, IconFilter, IconMic, IconMore, IconPanelRight, IconPencil, IconPlus, IconSearch, IconShare, IconSmile,
  IconSend, IconStop, IconWave,
} from '../ui/shell/line-icons';
import {
  approveAction, ChatApiError, createThread, fetchBootstrap, fetchFile, fetchMe, fetchMessages, fetchRoutines, markRead, rejectAction, sendMessage, toggleReaction, transcribe, uploadImage,
} from './api';
import { Briefing } from './Briefing';
import { BriefingPanel, type BriefingDoc, type BriefingTab } from './BriefingPanel';
import { dayLabel, messageText, MORE_REACTIONS, QUICK_REACTIONS, reactionChips, startsNewDay } from './briefing-format';
import { hintWikiSlug } from '../persona/intent';
import { displayBotName } from '../agent/agent-format';
import { agentOf, useAgent } from '../agent/agent-store';
import { emitCommand } from './desktop';
import { SkChat, SkDoc, SkThreads } from '../ui/Skeleton';
import { Tip } from '../ui/Tooltip';
import { shortcutHint } from '../ui/shell/shortcuts';
import { agentsOf, mainThreadOf, marqueeShift, needsBriefing, splitThreads, threadLabel } from './thread-list';
import { BotAvatar } from './BotAvatar';
import { activityLabel, outlineEntries } from './chat-activity';
import { ActivityBar, ChatOutline } from './ChatOutline';
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

/**
 * One conversation in the Start sidebar. A title that does not fit never wraps: while the row is hovered
 * the text slides left to show the rest (CSS; off under reduced motion) and a card to the right gives the
 * full title and the last activity.
 */
function ThreadRow({ thread, selected, onSelect, label, botName }: { thread: ChatThread; selected: boolean; onSelect: () => void; label?: string; botName?: string }) {
  const title = label ?? threadLabel(thread);
  const text = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  const measure = () => {
    const el = text.current;
    setShift(el ? marqueeShift(el.scrollWidth, el.clientWidth) : 0);
  };
  const card = (
    <>
      <strong>{title}</strong>
      <span>
        {botName ? `${botName} · ` : ''}Aktualisiert {relTime(thread.lastMessageAt)}
      </span>
    </>
  );
  return (
    <Tip label={card} card side="right" align="start">
      <button
        className={`ws-thread${shift > 0 ? ' slides' : ''}`}
        aria-selected={selected}
        onClick={onSelect}
        onMouseEnter={measure}
        style={shift > 0 ? ({ '--shift': `${-shift}px`, '--slide': `${Math.max(0.6, shift / 60)}s` } as React.CSSProperties) : undefined}
      >
        <BotAvatar bot={thread.bots[0]} size={18} radius={4} />
        <span className="ws-thread-title" ref={text}>
          <span>{title}</span>
        </span>
        {thread.unread && <span className="ws-unread" aria-label="ungelesen" />}
      </button>
    </Tip>
  );
}

/**
 * Agent card at the top of the Start sidebar. No colour change on hover: the latest message slides left to
 * show more of itself (off under reduced motion). Clicking opens the main conversation.
 */
function AgentCard({ name, bot, status, disabled, onOpen, onEdit, share }: { name: string; bot?: ChatBot | null; status: string; disabled?: boolean; onOpen: () => void; onEdit?: () => void; share?: boolean }) {
  const text = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  // Name and message slide together; the room the hover buttons take is part of what has to be revealed.
  const buttons = (onEdit ? 1 : 0) + (share ? 1 : 0);
  const measure = () => {
    const el = text.current;
    setShift(el ? marqueeShift(el.scrollWidth, el.clientWidth - buttons * 30, 24) : 0);
  };
  return (
    <div className={`ws-agent${shift > 0 ? ' slides' : ''}${buttons ? ' has-actions' : ''}`} onMouseEnter={measure} style={shift > 0 ? ({ '--shift': `${-shift}px`, '--slide': `${Math.max(1, shift / 45)}s` } as React.CSSProperties) : undefined}>
      <button className="ws-agent-main" aria-label={`${name}: Hauptunterhaltung öffnen`} disabled={disabled} onClick={onOpen}>
        <BotAvatar bot={bot} size={45} radius={0} />
        <span className="ws-agent-text" ref={text}>
          <span>
            <span className="ws-agent-name">{name}</span>
            <span className="ws-agent-status">{status}</span>
          </span>
        </span>
      </button>
      {buttons > 0 && (
        <span className="ws-agent-actions">
          {onEdit && (
            <Tip label="Assistent bearbeiten" side="bottom">
              <button aria-label="Assistent bearbeiten" onClick={onEdit}>
                <IconPencil size={16} />
              </button>
            </Tip>
          )}
          {share && (
            // Placeholder: what sharing an assistant does is not specified yet.
            <Tip label="Teilen" side="bottom">
              <button aria-label="Teilen">
                <IconShare size={16} />
              </button>
            </Tip>
          )}
        </span>
      )}
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return label ? (
    <div className="ws-day" role="separator" aria-label={label}>
      <span>{label}</span>
    </div>
  ) : null;
}

/** Floating bar on a hovered assistant message: quick reactions, more emojis, and a small menu. */
function MessageBar({ text, onReact }: { text: string; onReact: (emoji: string) => void }) {
  const [open, setOpen] = useState<'emoji' | 'menu' | null>(null);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const pick = (emoji: string) => {
    setOpen(null);
    onReact(emoji);
  };
  return (
    <div className={`ws-msg-bar${open ? ' open' : ''}`} ref={ref}>
      {QUICK_REACTIONS.map((e) => (
        <Tip key={e} label="Reagieren" side="top">
          <button className="emoji" aria-label={`Mit ${e} reagieren`} onClick={() => pick(e)}>
            {e}
          </button>
        </Tip>
      ))}
      <Tip label="Weitere Reaktionen" side="top" disabled={open === 'emoji'}>
        <button aria-label="Weitere Reaktionen" aria-haspopup="menu" aria-expanded={open === 'emoji'} onClick={() => setOpen((o) => (o === 'emoji' ? null : 'emoji'))}>
          <IconSmile size={16} />
        </button>
      </Tip>
      <Tip label="Mehr" side="top" disabled={open === 'menu'}>
        <button aria-label="Mehr" aria-haspopup="menu" aria-expanded={open === 'menu'} onClick={() => setOpen((o) => (o === 'menu' ? null : 'menu'))}>
          <IconMore size={16} />
        </button>
      </Tip>
      {open === 'emoji' && (
        <div className="ws-msg-pop emojis" role="menu">
          {MORE_REACTIONS.map((e) => (
            <button key={e} className="emoji" role="menuitem" aria-label={`Mit ${e} reagieren`} onClick={() => pick(e)}>
              {e}
            </button>
          ))}
        </div>
      )}
      {open === 'menu' && (
        <div className="ws-msg-pop" role="menu">
          <button
            role="menuitem"
            disabled={!text}
            onClick={() =>
              void navigator.clipboard
                .writeText(text)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => {
                    setCopied(false);
                    setOpen(null);
                  }, 900);
                })
                .catch(() => setOpen(null))
            }
          >
            <IconCopy size={15} /> {copied ? 'Kopiert' : 'Text kopieren'}
          </button>
        </div>
      )}
    </div>
  );
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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  // The assistant's profile: its own name replaces the base bot's name wherever that bot is shown.
  const profile = agentOf(useAgent(token));
  const nameOf = (b: { id: string; name: string } | null | undefined, fallback = 'Mecky') => displayBotName(b, b ? profile : null, fallback);
  // The day's briefing in the side panel (Audio | Text); `wide` gives it the conversation's place too.
  const [brief, setBrief] = useState<{ doc: BriefingDoc; tab: BriefingTab } | null>(null);
  const [briefWide, setBriefWide] = useState(false);
  const openWiki = (slug: string) => {
    hintWikiSlug(slug);
    emitCommand({ kind: 'navigate', section: 'wiki' });
  };
  const react = async (messageId: string, emoji: string) => {
    try {
      const r = await toggleReaction(token, messageId, emoji);
      setView((v) => ({ ...v, messages: v.messages.map((m) => (m.id === messageId ? { ...m, reactions: r.reactions ?? {} } : m)) }));
    } catch (e) {
      setView((v) => ({ ...v, error: guard(e) }));
    }
  };
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  // Conversations that belong to a routine are listed under "Aufgaben".
  const [routineThreads, setRoutineThreads] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    fetchRoutines(token)
      .then((r) => alive && setRoutineThreads(new Set(r.routines.map((x) => x.threadId))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchMe(token)
      .then((m) => alive && setMe(m.displayName || m.username || null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);
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
    setHistoryLoading(true);
    fetchMessages(token, threadId)
      .then((r) => {
        if (!alive) return;
        setHistoryLoading(false);
        setView({ ...emptyThread, messages: r.messages });
        const first = firstMessage.current;
        if (first && first.threadId === threadId) {
          firstMessage.current = null;
          sendFirst.current(threadId, first.text);
        }
      })
      .catch((e) => {
        if (!alive) return;
        setHistoryLoading(false);
        setView({ ...emptyThread, error: guard(e) });
      });
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
  // The agent card stands for the default assistant and its main conversation, whatever thread is open.
  const agent = boot?.presets[0] ?? leadBot;
  const mainThread = mainThreadOf(boot?.threads ?? [], agent?.id);
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

  // The assistant picker and the filter menu close on a click elsewhere and on Escape.
  useEffect(() => {
    if (!picker && !filterOpen) return;
    const close = () => {
      setPicker(false);
      setFilterOpen(false);
    };
    const away = (e: MouseEvent) => !(e.target as Element | null)?.closest?.('.ws-new') && close();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [picker, filterOpen]);

  // ⌘N: a new conversation with the default assistant (latest state through a ref).
  const startNew = useRef(() => {});
  startNew.current = () => {
    const bot = boot?.presets[0] ?? boot?.bots[0];
    if (bot) void newThread(bot);
  };

  // Tray, shortcut and toolbar commands. A command sent before mount is taken once.
  useEffect(() => {
    const handle = (c: DesktopCommand) => {
      if (c.kind === 'compose') input.current?.focus();
      else if (c.kind === 'dictate') void toggleDictation();
      else if (c.kind === 'capture') void attach(new Blob([c.bytes], { type: c.type }), c.name);
      else if (c.kind === 'toggleList') setListOpen((o) => !o);
      else if (c.kind === 'togglePanel') setPanelOpen((o) => !o);
      else if (c.kind === 'newChat') startNew.current();
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
  const agents = agentsOf(boot?.threads ?? []);
  const threads = (boot?.threads ?? []).filter(
    (t: ChatThread) =>
      (!agentFilter || t.bots[0]?.id === agentFilter) && (!q || `${t.title} ${t.lastMessagePreview} ${t.bots.map((b) => b.name).join(' ')}`.toLowerCase().includes(q)),
  );
  const lists = splitThreads(threads, routineThreads);
  const isMain = !!thread && thread.id === mainThread?.id;
  const streaming = view.streaming.length > 0;
  const liveMsg = streaming ? view.messages.find((m) => m.id === view.streaming[view.streaming.length - 1]) : undefined;
  const outline = useMemo(() => outlineEntries(view.messages, me || 'Du'), [view.messages, me]);

  return (
    <div className={`ws${listOpen ? '' : ' no-list'}${panelOpen || brief ? ' with-panel' : ''}${brief && briefWide ? ' panel-wide' : ''}`}>
      {listOpen && (
        <aside className="ws-list">
          <AgentCard
            name={nameOf(agent)}
            onEdit={profile ? () => emitCommand({ kind: 'navigate', section: 'agent' }) : undefined}
            share
            bot={agent}
            status={streaming ? 'Arbeitet …' : (mainThread && mainThread.id !== threadId ? mainThread.lastMessagePreview : textOf(lastBotMsg)) || mainThread?.lastMessagePreview || 'Bereit'}
            disabled={!boot}
            onOpen={() => {
              if (mainThread) setThreadId(mainThread.id);
              else if (agent) void newThread(agent);
            }}
          />

          <div className="ws-list-tools">
            <div className="ws-new">
              <div className="ws-split">
                <Tip label="Neue Unterhaltung" keys={shortcutHint('newChat')} side="bottom">
                  <button className="ws-split-main" disabled={!boot} onClick={() => startNew.current()}>
                    <IconPlus size={15} /> Neu
                  </button>
                </Tip>
                <Tip label="Assistent wählen" side="bottom" disabled={picker}>
                  <button className="ws-split-more" disabled={!boot} aria-label="Assistent wählen" aria-haspopup="menu" aria-expanded={picker} onClick={() => setPicker((p) => !p)}>
                    <IconChevronDown size={13} />
                  </button>
                </Tip>
              </div>
              {picker && (
                <div className="ws-picker" role="menu">
                  {pickable.map((b) => (
                    <button key={b.id} className="ws-picker-item" role="menuitem" onClick={() => void newThread(b)}>
                      <BotAvatar bot={b} size={26} />
                      <span>
                        <strong>{nameOf(b)}</strong>
                        <span className="w-muted">{b.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Tip label={recording ? 'Aufnahme beenden' : 'Aufnehmen'} side="bottom">
              <button className={`w-round${recording ? ' rec' : ''}`} aria-label={recording ? 'Aufnahme beenden' : 'Aufnehmen'} onClick={() => void toggleDictation()}>
                <IconWave size={15} />
              </button>
            </Tip>
            <span className="ws-tools-spacer" />
            {agents.length > 1 && (
              <div className="ws-new">
                <Tip label="Nach Assistent filtern" side="bottom" disabled={filterOpen}>
                  <button className={`w-icon${agentFilter || filterOpen ? ' on' : ''}`} aria-label="Nach Assistent filtern" aria-haspopup="menu" aria-expanded={filterOpen} onClick={() => setFilterOpen((o) => !o)}>
                    <IconFilter size={16} />
                  </button>
                </Tip>
                {filterOpen && (
                  <div className="ws-picker ws-filter" role="menu">
                    {[{ id: null as string | null, name: 'Alle Assistenten' }, ...agents.map((a) => ({ ...a, name: nameOf(a) }))].map((a) => (
                      <button
                        key={a.id ?? 'all'}
                        className="ws-picker-item"
                        role="menuitemradio"
                        aria-checked={agentFilter === a.id}
                        onClick={() => {
                          setAgentFilter(a.id);
                          setFilterOpen(false);
                        }}
                      >
                        {a.id ? <BotAvatar bot={{ id: a.id, name: a.name }} size={18} radius={4} /> : <span className="ws-filter-all" />}
                        <span>{a.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Tip label="Suchen" keys={shortcutHint('search')} side="bottom">
              <button
                className={`w-icon${search !== null ? ' on' : ''}`}
                aria-label="Suchen"
                onClick={() => {
                  setSearch((x) => (x === null ? '' : null));
                  setTimeout(() => searchInput.current?.focus(), 0);
                }}
              >
                <IconSearch size={16} />
              </button>
            </Tip>
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
            <div className="ws-group">Aufgaben</div>
            {lists.tasks.map((t) => (
              <ThreadRow key={t.id} thread={t} selected={t.id === threadId} onSelect={() => setThreadId(t.id)} botName={nameOf(t.bots[0], '')} />
            ))}
            {!boot && !bootError && <SkThreads rows={2} />}
            {boot && lists.tasks.length === 0 && <div className="ws-empty">{q || agentFilter ? 'Nichts gefunden.' : 'Noch keine Unterhaltungen aus Routinen.'}</div>}

            <div className="ws-group">Zuletzt verwendet</div>
            {lists.recent.map((t) => (
              <ThreadRow key={t.id} thread={t} selected={t.id === threadId} onSelect={() => setThreadId(t.id)} label={t.id === mainThread?.id ? 'Hauptunterhaltung' : undefined} botName={nameOf(t.bots[0], '')} />
            ))}
            {!boot && !bootError && <SkThreads rows={6} />}
            {boot && lists.recent.length === 0 && <div className="ws-empty">{q || agentFilter ? 'Nichts gefunden.' : 'Noch keine Unterhaltung. Starte mit „Neu“.'}</div>}
          </div>

          {footer && <div className="ws-list-foot">{footer}</div>}
        </aside>
      )}

      <section className="ws-chat">
        {thread ? (
          <>
            <header className="ws-chat-head">
              <strong className="w-ellipsis">{isMain ? 'Hauptunterhaltung' : threadLabel(thread)}</strong>
              <span className="ws-tools-spacer" />
              <Tip label="Details zur Unterhaltung" keys={shortcutHint('togglePanel')} side="bottom">
                <button className={`w-icon${panelOpen ? ' on' : ''}`} aria-label="Details zur Unterhaltung" onClick={() => setPanelOpen((o) => !o)}>
                  <IconPanelRight size={16} />
                </button>
              </Tip>
            </header>
            <div className="ws-messages" ref={scroller}>
              <div className="ws-messages-inner">
                {historyLoading && view.messages.length === 0 && <SkChat />}
                {view.messages.map((m, mi) => {
                  const bot = m.botId ? botsById.get(m.botId) : undefined;
                  const divider = startsNewDay(view.messages[mi - 1], m) ? <DayDivider key={`d-${m.id}`} label={dayLabel(m.createdAt)} /> : null;
                  if (m.role === 'user')
                    return [
                      divider,
                      <div key={m.id} className="ws-msg user" data-mid={m.id}>
                        {m.parts.map((p, i) => (
                          <Part key={i} part={p} h={handlers(m.id)} />
                        ))}
                      </div>,
                    ];
                  const live = view.streaming.includes(m.id);
                  // An empty streaming reply stays hidden: the activity bar above the composer shows the work.
                  if (live && m.parts.length === 0) return [divider];
                  return [
                    divider,
                    <div key={m.id} className="ws-msg bot">
                      <BotAvatar bot={bot ?? leadBot} size={32} radius={8} />
                      <div className="ws-msg-body">
                        <div className="ws-msg-meta">
                          <strong className="ws-bot-name">{nameOf(bot, 'Assistent')}</strong>
                          <span className="w-muted">{relTime(m.createdAt)}</span>
                        </div>
                        {m.parts.map((p, i) => (
                          <Part key={i} part={p} h={handlers(m.id)} />
                        ))}
                        {reactionChips(m.reactions).length > 0 && (
                          <div className="ws-reactions">
                            {reactionChips(m.reactions).map((r) => (
                              <Tip key={r.emoji} label="Reaktion entfernen" side="top">
                                <button className="ws-reaction" aria-label={`Reaktion ${r.emoji} entfernen`} onClick={() => void react(m.id, r.emoji)}>
                                  {r.emoji}
                                  {r.count > 1 && <span>{r.count}</span>}
                                </button>
                              </Tip>
                            ))}
                          </div>
                        )}
                      </div>
                      {!live && !m.id.startsWith('local-') && <MessageBar text={messageText(m.parts)} onReact={(emoji) => void react(m.id, emoji)} />}
                    </div>,
                  ];
                })}
                {isMain && !historyLoading && !streaming && needsBriefing(view.messages) && (
                  <>
                    {view.messages.length > 0 && <DayDivider label="Heute" />}
                    <Briefing token={token} bot={agent} name={nameOf(agent)} onOpen={(tab, doc) => setBrief({ doc, tab })} />
                  </>
                )}
                {view.error && <div className="ws-error">{view.error}</div>}
              </div>
            </div>

            <ChatOutline entries={outline} scroller={scroller} />
            {streaming && <ActivityBar bot={(liveMsg?.botId && botsById.get(liveMsg.botId)) || leadBot} label={activityLabel(liveMsg)} />}
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
                placeholder={`Nachricht an ${nameOf(leadBot)}`}
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
                <Tip label="Erwähnen" side="top">
                  <button type="button" className="w-icon" aria-label="Erwähnen" onClick={() => setDraft((d) => `${d}@`)}>
                    <IconAt size={17} />
                  </button>
                </Tip>
                {window.studio?.desktop && (
                  <Tip label="Bildschirmfoto anhängen" side="top">
                    <button type="button" className="w-icon" aria-label="Bildschirmfoto anhängen" onClick={() => void window.studio.desktop?.capture()}>
                      <IconCapture size={17} />
                    </button>
                  </Tip>
                )}
                <span className="ws-tools-spacer" />
                <Tip label={recording ? 'Aufnahme beenden' : 'Diktieren'} side="top">
                  <button type="button" className={`w-circle ink${recording ? ' rec' : ''}`} onClick={() => void toggleDictation()} aria-label={recording ? 'Aufnahme beenden' : 'Diktieren'}>
                    {recording ? <IconStop size={15} /> : <IconMic size={16} />}
                  </button>
                </Tip>
                {draft.trim() || attachments.length > 0 || busy ? (
                  <Tip label="Senden" keys="↵" side="top">
                    <button className="w-circle green" disabled={busy || uploading} aria-label="Senden">
                      {busy ? <span className="ws-spinner light" /> : <IconSend size={16} />}
                    </button>
                  </Tip>
                ) : (
                  // Nothing to send yet: the accent button starts voice input instead.
                  <Tip label="Sprechen" side="top">
                    <button type="button" className="w-circle green" disabled={recording} aria-label="Sprechen" onClick={() => void toggleDictation()}>
                      <IconWave size={16} />
                    </button>
                  </Tip>
                )}
              </div>
            </form>
          </>
        ) : (
          <>
            {boot ? (
              <div className="ws-messages">
                <div className="ws-messages-inner">
                  <Briefing token={token} bot={agent} name={nameOf(agent)} onOpen={(tab, doc) => setBrief({ doc, tab })} />
                </div>
              </div>
            ) : bootError ? (
              <div className="placeholder">Wähle links eine Unterhaltung oder starte eine neue.</div>
            ) : (
              <SkChat />
            )}
          </>
        )}
      </section>

      {brief && (
        <aside className="ws-panel">
          <BriefingPanel
            token={token}
            briefing={brief.doc}
            tab={brief.tab}
            onTab={(tab) => setBrief((x) => (x ? { ...x, tab } : x))}
            onClose={() => {
              setBrief(null);
              setBriefWide(false);
            }}
            wide={briefWide}
            onWide={setBriefWide}
            onWiki={openWiki}
          />
        </aside>
      )}
      {panelOpen && !brief && (
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
                    <SkDoc lines={10} />
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
