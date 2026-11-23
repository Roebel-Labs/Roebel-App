// The mini-app builder inside Ortis Studio: chat on the left, live preview on the right
// (Langdock-style "Apps im Chat erstellen"). Same contract and endpoints as the web /editor:
// single-file HTML apps, built by /api/mini-apps/generate, published by /api/mini-apps/publish.
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n';
import { IconCheck, IconClose, IconRefresh, IconSend, IconStop } from '../ui/shell/line-icons';
import {
  BuilderApiError,
  draftManifest,
  extractResult,
  fetchAppSource,
  fetchTemplate,
  generateApp,
  previewDoc,
  publishApp,
  screensOf,
  seedContent,
  type BuildTurn,
  type CmsSeed,
  audienceFor,
  credentialsLive,
  fetchMyOrgs,
  type ManagedOrg,
  type ManifestDraft,
  type PublishResult,
} from './builder-api';

export type BuilderStart = { kind: 'blank' } | { kind: 'template'; id: string } | { kind: 'app'; id: string; name: string };

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  versionIndex?: number;
  error?: boolean;
}

type Stage = 'plan' | 'build' | 'finish';

const uid = () => Math.random().toString(36).slice(2, 10);
const open = (url: string) => {
  if (/^https:\/\//.test(url)) void window.studio.shell.openExternal(url);
};

/** History sent to the model: short assistant summaries, at most 24 turns, ends with the user. */
export function toTurns(messages: Msg[]): BuildTurn[] {
  const turns = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  return turns.slice(-24);
}

export function AppBuilder({ token, start, onClose }: { token: string; start: BuilderStart; onClose: (changed: boolean) => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [versions, setVersions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(start.kind !== 'blank');
  const [streaming, setStreaming] = useState(false);
  const [stage, setStage] = useState<Stage>('plan');
  const [liveHtml, setLiveHtml] = useState('');
  const [hard, setHard] = useState(false);
  const [cmsSeed, setCmsSeed] = useState<CmsSeed[]>([]);
  const [preset, setPreset] = useState<ManifestDraft | null>(null);
  const [published, setPublished] = useState<PublishResult | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [changed, setChanged] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const html = active >= 0 ? versions[active] ?? null : null;
  const title = preset?.name ?? (start.kind === 'app' ? start.name : t('Neue Mini-App'));

  // Load the starting point (template or own app).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (start.kind === 'template') {
          const tpl = await fetchTemplate(start.id);
          if (!alive) return;
          setVersions([tpl.html]);
          setActive(0);
          setCmsSeed(tpl.cms);
          setSuggestions(tpl.suggestions);
          setMessages([{ id: uid(), role: 'assistant', versionIndex: 0, content: t('Die Vorlage „{title}“ ist geladen. Beschreibe, was du anpassen möchtest: Texte, Inhalte, Farben oder neue Funktionen.', { title: tpl.title }) }]);
        } else if (start.kind === 'app') {
          const src = await fetchAppSource(start.id);
          if (!alive) return;
          if (!src) throw new Error(t('Für diese App ist kein Quelltext gespeichert. Extern gehostete Apps können hier nicht bearbeitet werden.'));
          setVersions([src.html]);
          setActive(0);
          setPreset(src.manifest);
          setPublished({ ok: true, slug: src.manifest.slug, homeUrl: '', republished: true });
          setMessages([{ id: uid(), role: 'assistant', versionIndex: 0, content: t('„{name}“ ist geladen. Beschreibe, was du ändern möchtest. Veröffentlichen reicht eine neue Version ein.', { name: src.manifest.name }) }]);
        }
      } catch (e) {
        if (alive) setMessages([{ id: uid(), role: 'assistant', error: true, content: (e as Error).message }]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, [start]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, streaming]);

  const liveScreens = useMemo(() => screensOf(liveHtml), [liveHtml]);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || streaming || loading) return;
    const userMsg: Msg = { id: uid(), role: 'user', content: prompt };
    const convo = [...messages, userMsg];
    setMessages(convo);
    setInput('');
    setSuggestions([]);
    setStreaming(true);
    setStage('plan');
    setLiveHtml('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { raw, finish } = await generateApp(
        token,
        { messages: toTurns(convo), html: html ?? undefined, complexity: hard ? 'hard' : 'default' },
        {
          onPhase: () => setStage('plan'),
          onThink: () => setStage('plan'),
          onHtml: (soFar) => {
            setStage('build');
            setLiveHtml(soFar);
          },
        },
        controller.signal,
      );
      const result = extractResult(raw);
      if (!result.html) {
        throw new Error(
          finish === 'length' || result.truncated
            ? t('Die App wurde zu lang und ist mitten im Schreiben abgebrochen. Versuche es mit einer kleineren Änderung.')
            : t('Die KI hat keine vollständige App geliefert. Bitte formuliere die Anfrage noch einmal.'),
        );
      }
      setStage('finish');
      const index = versions.length;
      setVersions((v) => [...v, result.html!]);
      setActive(index);
      setChanged(true);
      setMessages((m) => [...m, { id: uid(), role: 'assistant', versionIndex: index, content: result.notes || t('Fertig. Die neue Version ist in der Vorschau.') }]);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setMessages((m) => [...m, { id: uid(), role: 'assistant', error: true, content: t('Abgebrochen.') }]);
      } else {
        setMessages((m) => [...m, { id: uid(), role: 'assistant', error: true, content: e instanceof BuilderApiError || e instanceof Error ? e.message : String(e) }]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  const started = messages.length > 0;

  return (
    <div className="builder">
      <header className="builder-head">
        <button className="w-round" aria-label={t('Schließen')} onClick={() => onClose(changed)}>
          <IconClose size={16} />
        </button>
        <strong className="w-ellipsis">{title}</strong>
        {versions.length > 1 && (
          <select className="builder-versions" value={active} disabled={streaming} onChange={(e) => setActive(Number(e.target.value))} aria-label={t('Version')}>
            {versions.map((_, i) => (
              <option key={i} value={i}>
                {t('Version {n} von {total}', { n: i + 1, total: versions.length })}
              </option>
            ))}
          </select>
        )}
        <span className="ws-tools-spacer" />
        <button className="w-btn green" disabled={!html || streaming} onClick={() => setPublishOpen(true)}>
          {published?.republished ? t('Neue Version veröffentlichen') : t('Veröffentlichen')}
        </button>
      </header>

      <div className="builder-body">
        <aside className="builder-chat">
          <div className="builder-msgs">
            {!started && !loading && (
              <div className="builder-intro">
                <strong>{t('Was soll deine App können?')}</strong>
                <span className="w-muted">{t('Beschreibe sie in ein paar Sätzen, zum Beispiel: Eine App für unseren Sportverein mit Trainingszeiten und Zusagen.')}</span>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`builder-msg ${m.role}${m.error ? ' error' : ''}`}>
                <p>{m.content}</p>
                {m.versionIndex !== undefined && m.versionIndex !== active && versions[m.versionIndex] && (
                  <button className="builder-link" onClick={() => setActive(m.versionIndex!)}>
                    {t('Version {n} ansehen', { n: m.versionIndex + 1 })}
                  </button>
                )}
              </div>
            ))}
            {streaming && (
              <div className="builder-msg assistant pending">
                <p>{stage === 'plan' ? t('Plane die App …') : t('Baue die App …')}</p>
              </div>
            )}
            {suggestions.length > 0 && !streaming && (
              <div className="builder-chips">
                {suggestions.map((s) => (
                  <button key={s} className="w-pill" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form
            className="builder-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <textarea
              value={input}
              placeholder={html ? t('Was soll sich ändern?') : t('Beschreibe deine App …')}
              rows={3}
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            <div className="builder-composer-row">
              <label className="builder-toggle" title={t('Gründlicher, dauert länger')}>
                <input type="checkbox" checked={hard} disabled={streaming} onChange={(e) => setHard(e.target.checked)} /> {t('Gründlich')}
              </label>
              <span className="ws-tools-spacer" />
              {streaming ? (
                <button type="button" className="w-round" aria-label={t('Stopp')} onClick={() => abortRef.current?.abort()}>
                  <IconStop size={15} />
                </button>
              ) : (
                <button type="submit" className="w-circle green" aria-label={t('Senden')} disabled={!input.trim() || loading}>
                  <IconSend size={15} />
                </button>
              )}
            </div>
          </form>
        </aside>

        <section className="builder-stage">
          {streaming ? (
            <div className="builder-progress">
              <div className="builder-steps">
                {(['plan', 'build', 'finish'] as Stage[]).map((s, i) => (
                  <div key={s} className={`builder-step${s === stage ? ' on' : ''}${(['plan', 'build', 'finish'] as Stage[]).indexOf(stage) > i ? ' done' : ''}`}>
                    <span />
                    {s === 'plan' ? t('Planen') : s === 'build' ? t('Bauen') : t('Abschluss')}
                  </div>
                ))}
              </div>
              <p className="w-muted">{stage === 'plan' ? t('Die Screens und Daten der App werden festgelegt.') : t('Die App wird geschrieben: {chars} Zeichen', { chars: liveHtml.length.toLocaleString() })}</p>
              {liveScreens.length > 0 && (
                <ul className="builder-screens">
                  {liveScreens.map((s) => (
                    <li key={s.slug}>{s.title}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : html ? (
            <div className="builder-phone-wrap">
              <div className="builder-phone">
                <iframe key={`${active}-${reloadKey}`} title={t('Vorschau')} sandbox="allow-scripts allow-popups allow-forms" srcDoc={previewDoc(html)} />
              </div>
              <button className="w-btn" onClick={() => setReloadKey((k) => k + 1)}>
                <IconRefresh size={14} /> {t('Neu laden')}
              </button>
            </div>
          ) : (
            <div className="builder-empty w-muted">{loading ? t('Wird geladen …') : t('Hier erscheint die Vorschau deiner App.')}</div>
          )}
        </section>
      </div>

      {publishOpen && html && (
        <PublishPanel
          token={token}
          html={html}
          idea={messages.find((m) => m.role === 'user')?.content}
          preset={preset}
          onClose={() => setPublishOpen(false)}
          onPublished={(r, manifest) => {
            setPreset(manifest);
            setPublished({ ...r, republished: true });
            setChanged(true);
            if (!r.republished && cmsSeed.length > 0) void seedContent(token, r.slug, cmsSeed);
          }}
        />
      )}
    </div>
  );
}

function PublishPanel({
  token,
  html,
  idea,
  preset,
  onClose,
  onPublished,
}: {
  token: string;
  html: string;
  idea?: string;
  preset: ManifestDraft | null;
  onClose: () => void;
  onPublished: (r: PublishResult, manifest: ManifestDraft) => void;
}) {
  const [draft, setDraft] = useState<ManifestDraft | null>(preset);
  const [busy, setBusy] = useState(!preset);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PublishResult | null>(null);
  const [orgs, setOrgs] = useState<ManagedOrg[]>([]);
  const [membersLive, setMembersLive] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchMyOrgs(token)
      .then((o) => alive && setOrgs(o))
      .catch(() => {});
    credentialsLive().then((v) => alive && setMembersLive(v));
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (preset) return;
    let alive = true;
    draftManifest(token, html, idea)
      .then((m) => alive && setDraft(m))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [token, html, idea, preset]);

  const set = <K extends keyof ManifestDraft>(k: K, v: ManifestDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function publish() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const r = await publishApp(token, html, draft);
      setDone(r);
      onPublished(r, draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="builder-sheet" role="dialog" aria-label={t('Veröffentlichen')}>
      <div className="builder-sheet-card">
        <header className="builder-sheet-head">
          <strong>{t('Veröffentlichen')}</strong>
          <span className="ws-tools-spacer" />
          <button className="w-round" aria-label={t('Schließen')} onClick={onClose}>
            <IconClose size={16} />
          </button>
        </header>
        {done ? (
          <div className="builder-done">
            <IconCheck size={20} />
            <p>{done.republished ? t('Die neue Version ist eingereicht und erscheint nach der Prüfung.') : t('Deine App ist eingereicht. Nach der Prüfung erscheint sie in der Röbel App.')}</p>
            {done.homeUrl && (
              <button className="w-btn" onClick={() => open(done.homeUrl)}>
                {t('App öffnen')}
              </button>
            )}
          </div>
        ) : !draft ? (
          <p className={error ? 'ws-error' : 'w-muted'}>{error ?? t('Name und Beschreibung werden vorgeschlagen …')}</p>
        ) : (
          <div className="builder-form">
            <label>
              {t('Name')}
              <input value={draft.name} maxLength={40} onChange={(e) => set('name', e.target.value)} />
            </label>
            <label>
              {t('Kurzname (Adresse)')}
              <input value={draft.slug} disabled={!!preset} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
              <span className="w-muted">{draft.slug ? `${draft.slug}.roebel.site` : ''}</span>
            </label>
            <label>
              {t('Beschreibung')}
              <textarea rows={3} value={draft.description} maxLength={280} onChange={(e) => set('description', e.target.value)} />
            </label>
            {(orgs.length > 0 || draft.org) && (
              <label>
                {t('Für wen ist die App?')}
                <select
                  value={draft.org ?? ''}
                  onChange={(e) => setDraft((d) => (d ? { ...d, ...audienceFor(e.target.value || null, 'recommended') } : d))}
                >
                  <option value="">{t('Für alle in der Röbel App')}</option>
                  {orgs.map((o) => (
                    <option key={o.accountId} value={o.accountId}>
                      {o.name}
                    </option>
                  ))}
                  {draft.org && !orgs.some((o) => o.accountId === draft.org) && <option value={draft.org}>{t('Bisherige Organisation')}</option>}
                </select>
              </label>
            )}
            {draft.org && (
              <div className="builder-radio">
                <label>
                  <input
                    type="radio"
                    checked={draft.audience?.mode !== 'required'}
                    onChange={() => setDraft((d) => (d ? { ...d, ...audienceFor(d.org ?? null, 'recommended') } : d))}
                  />
                  <span>
                    <strong>{t('Empfohlen für Mitglieder')}</strong>
                    <span className="w-muted">{t('Alle können die App öffnen. Sie erscheint als App eurer Organisation.')}</span>
                  </span>
                </label>
                <label className={membersLive ? '' : 'off'}>
                  <input
                    type="radio"
                    disabled={!membersLive && draft.audience?.mode !== 'required'}
                    checked={draft.audience?.mode === 'required'}
                    onChange={() => setDraft((d) => (d ? { ...d, ...audienceFor(d.org ?? null, 'required') } : d))}
                  />
                  <span>
                    <strong>{t('Nur für Mitglieder')}</strong>
                    <span className="w-muted">
                      {membersLive
                        ? t('Nur wer einen Mitgliedsausweis eurer Organisation hat, kann sie öffnen.')
                        : t('Geht, sobald Mitgliedsausweise freigeschaltet sind.')}
                    </span>
                  </span>
                </label>
              </div>
            )}
            {error && <p className="ws-error">{error}</p>}
            <button className="w-btn green" disabled={busy || !draft.name.trim() || !draft.slug} onClick={() => void publish()}>
              {busy ? t('Wird veröffentlicht …') : preset ? t('Neue Version einreichen') : t('Zur Prüfung einreichen')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
