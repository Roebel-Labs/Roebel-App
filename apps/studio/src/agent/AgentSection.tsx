// "Assistent": the assistant's own profile page (name, mailbox, phones, personality, tools). Not a rail
// item; opened from the agent card on Start and from the account menu.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import meckyUrl from '../assets/mecky-welcome.png';
import { LoadError, Modal, SignedOutHint, Toggle, useSessionToken } from '../persona/common';
import { fmtDate, friendlyError } from '../persona/format';
import { hintSkillsTab } from '../persona/intent';
import '../persona/persona.css';
import { Busy, SkLines, SkRows, Skeleton } from '../ui/Skeleton';
import { Tip } from '../ui/Tooltip';
import { IconCheck, IconCopy, IconSms, IconWhatsapp } from '../ui/shell/line-icons';
import type { Section } from '../ui/shell/nav';
import {
  confirmAgentEmailCode, createAgentChannel, deleteAgentChannel, fetchMe, patchAgent, requestAgentEmailCode,
  type Agent, type AgentChannel, type AgentLinkCode, type AgentPatch, type AgentPersonality,
} from '../workspace/api';
import { botInitial, isMecky } from '../workspace/BotAvatar';
import { firstName } from '../workspace/thread-list';
import { CHANNEL_LABEL, cleanAlias, isExpired, newChannel, splitAddress, toolLabel } from './agent-format';
import { loadAgent, setAgentData, useAgent } from './agent-store';
import './agent.css';

const MAX_INSTRUCTIONS = 4000;

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ value, label = 'Kopieren' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Tip label={done ? 'Kopiert' : label} side="top">
      <button
        className="w-icon"
        aria-label={label}
        onClick={() =>
          void copyText(value).then((ok) => {
            setDone(ok);
            if (ok) setTimeout(() => setDone(false), 1800);
          })
        }
      >
        {done ? <IconCheck size={16} /> : <IconCopy size={16} />}
      </button>
    </Tip>
  );
}

export function AgentSection({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const session = useSessionToken();
  const token = session.token;
  const state = useAgent(token);
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetchMe(token)
      .then((me) => alive && setOwner(firstName(me.displayName)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="section ag">
      <div className="ag-scroll">
        <div className="ag-col">
          {session.state === 'signed-out' && <SignedOutHint what="die Einstellungen deines Assistenten" />}
          {(session.state === 'loading' || (token && state.status === 'loading')) && <AgentSkeleton />}
          {token && state.status === 'unavailable' && <div className="pz-state w-muted">Die Seite deines Assistenten ist auf diesem Server noch nicht verfügbar.</div>}
          {token && state.status === 'error' && <LoadError message={state.message} onRetry={() => void loadAgent(token)} />}
          {token && state.status === 'ready' && <AgentPage token={token} agent={state.data.agent} personalities={state.data.personalities ?? []} owner={owner} onNavigate={onNavigate} />}
        </div>
      </div>
    </div>
  );
}

function AgentSkeleton() {
  return (
    <Busy>
      <div className="ag-head" aria-hidden="true">
        <Skeleton w={180} h={180} />
        <div className="ag-head-text">
          <Skeleton h={38} w={220} />
          <Skeleton h={14} w={200} />
          <Skeleton h={14} w={260} />
        </div>
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="ag-card" aria-hidden="true">
          <Skeleton h={22} w={220} />
          <Skeleton h={40} />
          <Skeleton h={14} w={240} />
          <SkLines lines={2} />
          <SkRows rows={2} tile={36} trailing={96} />
        </div>
      ))}
    </Busy>
  );
}

function AgentPage({ token, agent, personalities, owner, onNavigate }: { token: string; agent: Agent; personalities: AgentPersonality[]; owner: string | null; onNavigate: (s: Section) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  /** PATCH and adopt the answer; returns the server's message on failure (e.g. alias taken). */
  const save = async (key: string, patch: AgentPatch): Promise<string | null> => {
    setSaving(key);
    setError(null);
    try {
      setAgentData(await patchAgent(token, patch));
      return null;
    } catch (e) {
      return friendlyError(e);
    } finally {
      setSaving(null);
    }
  };
  const saveOrShow = async (key: string, patch: AgentPatch) => {
    const failed = await save(key, patch);
    if (failed) setError(failed);
  };

  const mecky = isMecky({ id: agent.botId, name: agent.defaultName });
  return (
    <>
      <header className="ag-head">
        {mecky ? (
          <img className="ag-figure" src={meckyUrl} alt="" draggable={false} />
        ) : (
          <span className="ag-figure initial" aria-hidden="true">
            {botInitial(agent.name)}
          </span>
        )}
        <div className="ag-head-text">
          <h1 className="ag-name">{agent.name}</h1>
          {agent.mail.address && <span className="ag-address">{agent.mail.address}</span>}
          <span className="w-muted">
            Assistent{owner ? ` von ${owner}` : ''}
            {fmtDate(agent.since) ? ` seit ${fmtDate(agent.since)}` : ''}
          </span>
        </div>
      </header>
      {error && <div className="ws-error">{error}</div>}

      <section className="ag-card">
        <h2>Name und Kontakt</h2>
        <NameField agent={agent} busy={saving === 'name'} onSave={(name) => saveOrShow('name', { name })} />
        <MailBlock token={token} agent={agent} saving={saving} save={save} onError={setError} />
      </section>

      <PhoneCard token={token} agent={agent} onError={setError} />

      <section className="ag-card">
        <h2>Persönlichkeit</h2>
        {personalities.length > 0 && (
          <>
            <h3>Wähle eine Persönlichkeit</h3>
            <div className="ag-presets" role="radiogroup" aria-label="Persönlichkeit">
              {personalities.map((p) => (
                <button key={p.key} className="ag-preset" role="radio" aria-checked={agent.personality === p.key} disabled={saving === 'personality'} onClick={() => agent.personality !== p.key && void saveOrShow('personality', { personality: p.key })}>
                  <span className="ag-preset-mark" aria-hidden="true">
                    {agent.personality === p.key && <IconCheck size={14} />}
                  </span>
                  <span className="ag-preset-text">
                    <strong>{p.title}</strong>
                    <span className="w-muted">{p.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        <Instructions agent={agent} busy={saving === 'instructions'} onSave={(customInstructions) => saveOrShow('instructions', { customInstructions })} />
        <h3>So klingt dein Name</h3>
        <p className="ag-hint">Schreib deinen Namen so, wie er klingt, etwa „Niew“ für Niamh. Dein Assistent richtet sich danach, wenn er dich anspricht.</p>
        <BlurInput value={agent.spokenName} placeholder="Optional" maxLength={80} ariaLabel="So klingt dein Name" onSave={(spokenName) => saveOrShow('spoken', { spokenName })} />
      </section>

      <section className="ag-card">
        <h2>Funktionen</h2>
        <p className="ag-hint">Das darf dein Assistent nutzen. Welche Dienste verbunden sind, legst du unter Funktionen fest.</p>
        {agent.tools.length === 0 ? (
          <div className="w-muted">Keine Werkzeuge freigeschaltet.</div>
        ) : (
          <ul className="ag-tools">
            {agent.tools.map((t) => (
              <li key={t}>
                <IconCheck size={15} /> {toolLabel(t)}
              </li>
            ))}
          </ul>
        )}
        <button
          className="pz-textlink ag-link"
          onClick={() => {
            hintSkillsTab('integrations');
            onNavigate('skills');
          }}
        >
          Integrationen verwalten <span aria-hidden="true">→</span>
        </button>
      </section>
    </>
  );
}

/** Text input that saves when it loses focus or on Enter, and only when the value changed. */
function BlurInput({ value, onSave, placeholder, maxLength, ariaLabel, disabled, mono }: { value: string; onSave: (v: string) => void; placeholder?: string; maxLength?: number; ariaLabel: string; disabled?: boolean; mono?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const v = draft.trim();
    if (v !== value) onSave(v);
  };
  return (
    <input
      className={`ag-input${mono ? ' mono' : ''}`}
      value={draft}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') setDraft(value);
      }}
    />
  );
}

function NameField({ agent, busy, onSave }: { agent: Agent; busy: boolean; onSave: (name: string | null) => void }) {
  return (
    <>
      {/* An empty field goes back to the assistant's own name. */}
      <BlurInput value={agent.name} placeholder={agent.defaultName} maxLength={40} ariaLabel="Name deines Assistenten" disabled={busy} onSave={(v) => onSave(v || null)} />
      <p className="ag-hint">So heißt dein Assistent überall in Ortis. Leer lassen stellt „{agent.defaultName}“ wieder her.</p>
    </>
  );
}

function MailBlock({ token, agent, saving, save, onError }: { token: string; agent: Agent; saving: string | null; save: (key: string, patch: AgentPatch) => Promise<string | null>; onError: (m: string | null) => void }) {
  const mail = agent.mail;
  const off = !mail.enabled;
  const { alias, domain } = splitAddress(mail.address);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(mail.alias ?? alias);
  const [aliasError, setAliasError] = useState<string | null>(null);

  const saveAlias = async () => {
    setAliasError(null);
    const failed = await save('alias', { mailAlias: draft });
    if (failed) setAliasError(failed);
    else setEditing(false);
  };
  const toggle = async (key: 'emailBriefing' | 'emailRoutines', value: boolean) => {
    const failed = await save(key, { [key]: value });
    onError(failed);
  };

  return (
    <div className={`ag-block${off ? ' off' : ''}`}>
      <h3>E-Mail-Adresse deines Assistenten</h3>
      {off && <p className="ag-hint">E-Mail ist auf diesem Server noch nicht eingerichtet.</p>}
      <div className="ag-box">
        {editing ? (
          <form
            className="ag-alias"
            onSubmit={(e) => {
              e.preventDefault();
              void saveAlias();
            }}
          >
            <input className="ag-input mono" value={draft} autoFocus aria-label="Adresse vor dem @" onChange={(e) => setDraft(cleanAlias(e.target.value))} />
            <span className="ag-domain">@{domain}</span>
            <button type="button" className="w-btn" onClick={() => setEditing(false)}>
              Abbrechen
            </button>
            <button className="w-btn" disabled={saving === 'alias' || !draft || draft === (mail.alias ?? alias)}>
              {saving === 'alias' ? 'Prüfe …' : 'Übernehmen'}
            </button>
          </form>
        ) : (
          <div className="ag-address-row">
            <code>{mail.address ?? 'Noch keine Adresse'}</code>
            {mail.address && !off && (
              <>
                <button
                  className="pz-textlink"
                  onClick={() => {
                    setDraft(mail.alias ?? alias);
                    setAliasError(null);
                    setEditing(true);
                  }}
                >
                  Adresse ändern
                </button>
                <CopyButton value={mail.address} label="Adresse kopieren" />
              </>
            )}
          </div>
        )}
        {aliasError && <div className="ws-error">{aliasError}</div>}
        <p className="ag-box-note">
          {mail.ownerEmail ? (
            <>
              Dein Assistent antwortet nur auf E-Mails von <strong>{mail.ownerEmail}</strong>. Andere können ihn über diese Adresse nicht erreichen.
            </>
          ) : (
            <>Dein Assistent antwortet nur auf E-Mails von deiner bestätigten Adresse. Andere können ihn über diese Adresse nicht erreichen.</>
          )}
        </p>
      </div>

      {!off && !mail.ownerVerified && <VerifyEmail token={token} initial={mail.ownerEmail ?? ''} onError={onError} />}

      <SwitchRow title="Tagesbriefing per E-Mail" text="Jeden Morgen der Überblick über deinen Tag in deinem Postfach." checked={mail.briefing} disabled={off || saving === 'emailBriefing'} onChange={(v) => void toggle('emailBriefing', v)} />
      <SwitchRow title="Ergebnisse von Routinen per E-Mail" text="Was deine Routinen erarbeiten, kommt zusätzlich als E-Mail." checked={mail.routines} disabled={off || saving === 'emailRoutines'} onChange={(v) => void toggle('emailRoutines', v)} />
    </div>
  );
}

function SwitchRow({ title, text, checked, disabled, onChange }: { title: string; text: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="ag-row">
      <div className="ag-row-text">
        <strong>{title}</strong>
        <span className="w-muted">{text}</span>
      </div>
      <span className="ag-row-state w-muted">{checked ? 'Ein' : 'Aus'}</span>
      <Toggle checked={checked} disabled={disabled} label={title} onChange={onChange} />
    </div>
  );
}

/** Confirms the owner's own address: e-mail, then the six-digit code sent to it. */
function VerifyEmail({ token, initial, onError }: { token: string; initial: string; onError: (m: string | null) => void }) {
  const [email, setEmail] = useState(initial);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    onError(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const send = () =>
    run(async () => {
      await requestAgentEmailCode(token, email.trim());
      setStep('code');
    });
  const confirm = () =>
    run(async () => {
      await confirmAgentEmailCode(token, code.trim());
      await loadAgent(token, true);
    });

  return (
    <form
      className="ag-verify"
      onSubmit={(e) => {
        e.preventDefault();
        void (step === 'email' ? send() : confirm());
      }}
    >
      <strong>Deine E-Mail-Adresse bestätigen</strong>
      <span className="w-muted">
        {step === 'email' ? 'Dein Assistent antwortet erst, wenn feststeht, dass die Adresse dir gehört.' : `Wir haben einen sechsstelligen Code an ${email.trim()} geschickt.`}
      </span>
      <div className="ag-verify-row">
        {step === 'email' ? (
          <input className="ag-input" type="email" value={email} placeholder="du@beispiel.de" aria-label="Deine E-Mail-Adresse" onChange={(e) => setEmail(e.target.value)} />
        ) : (
          <input className="ag-input mono" inputMode="numeric" value={code} placeholder="123456" maxLength={6} autoFocus aria-label="Code aus der E-Mail" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        )}
        {step === 'code' && (
          <button type="button" className="w-btn" disabled={busy} onClick={() => setStep('email')}>
            Andere Adresse
          </button>
        )}
        <button className="w-btn" disabled={busy || (step === 'email' ? !/^\S+@\S+\.\S+$/.test(email.trim()) : code.length !== 6)}>
          {busy ? '…' : step === 'email' ? 'Code senden' : 'Bestätigen'}
        </button>
      </div>
      {error && <div className="ws-error">{error}</div>}
    </form>
  );
}

function Instructions({ agent, busy, onSave }: { agent: Agent; busy: boolean; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(agent.customInstructions);
  useEffect(() => setDraft(agent.customInstructions), [agent.customInstructions]);
  const dirty = draft !== agent.customInstructions;
  return (
    <>
      <h3>Eigene Anweisungen</h3>
      <p className="ag-hint">Was dein Assistent immer beachten soll: Ton, Vorlieben, was er lassen soll.</p>
      <textarea className="ag-input ag-textarea" rows={6} value={draft} maxLength={MAX_INSTRUCTIONS} aria-label="Eigene Anweisungen" placeholder="z. B. Antworte kurz. Sprich mich mit Du an. Frag nach, bevor du etwas verschickst." onChange={(e) => setDraft(e.target.value)} />
      <div className="ag-save">
        <span className="w-muted">
          {draft.length.toLocaleString('de-DE')} / {MAX_INSTRUCTIONS.toLocaleString('de-DE')} Zeichen
        </span>
        <button className="w-btn green" disabled={busy || !dirty} onClick={() => onSave(draft.trim())}>
          {busy ? 'Speichere …' : 'Speichern'}
        </button>
      </div>
    </>
  );
}

const PHONE_ROWS: Array<{ kind: AgentChannel['kind']; title: string; text: string; icon: ReactNode }> = [
  { kind: 'sms', title: 'Per SMS schreiben', text: 'Schreib deinem Assistenten von deinem Handy, auch ohne die App.', icon: <IconSms size={20} /> },
  { kind: 'whatsapp', title: 'Per WhatsApp schreiben', text: 'Schreib deinem Assistenten in WhatsApp wie einem Kontakt.', icon: <IconWhatsapp size={20} /> },
];

function PhoneCard({ token, agent, onError }: { token: string; agent: Agent; onError: (m: string | null) => void }) {
  const [linking, setLinking] = useState<AgentChannel['kind'] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const remove = async (id: string) => {
    setBusy(id);
    onError(null);
    try {
      await deleteAgentChannel(token, id);
      await loadAgent(token, true);
    } catch (e) {
      onError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="ag-card">
      <h2>Telefon</h2>
      {PHONE_ROWS.map((r) => {
        const ready = !!agent.phone[r.kind]?.number;
        return (
          <div key={r.kind} className={`ag-row boxed${ready ? '' : ' off'}`}>
            <span className={`ag-row-icon ${r.kind}`}>{r.icon}</span>
            <div className="ag-row-text">
              <strong>{r.title}</strong>
              <span className="w-muted">{ready ? r.text : `${CHANNEL_LABEL[r.kind]} ist auf diesem Server noch nicht eingerichtet.`}</span>
            </div>
            <button className="w-btn" disabled={!ready} onClick={() => setLinking(r.kind)}>
              Verbinden
            </button>
          </div>
        );
      })}

      {agent.channels.length > 0 && (
        <>
          <h3>Verbundene Telefone</h3>
          <ul className="ag-channels">
            {agent.channels.map((c) => (
              <li key={c.id} className="ag-row">
                <div className="ag-row-text">
                  <strong className="ag-mono">{c.address}</strong>
                  <span className="w-muted">
                    {CHANNEL_LABEL[c.kind] ?? c.kind} · verbunden {fmtDate(c.verifiedAt)}
                  </span>
                </div>
                <button className="w-btn" disabled={busy === c.id} onClick={() => void remove(c.id)}>
                  Trennen
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {linking && <LinkPhoneDialog token={token} kind={linking} known={agent.channels} onClose={() => setLinking(null)} />}
    </section>
  );
}

/** QR code as an SVG path: black modules on a white tile, with the quiet zone the spec asks for. */
function QrCode({ value, size = 208 }: { value: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { path: d, count: n };
  }, [value]);
  const quiet = 3;
  return (
    <svg className="ag-qr" width={size} height={size} viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`} role="img" aria-label="QR-Code zum Verbinden" shapeRendering="crispEdges">
      <rect x={-quiet} y={-quiet} width={count + quiet * 2} height={count + quiet * 2} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}

function LinkPhoneDialog({ token, kind, known, onClose }: { token: string; kind: AgentChannel['kind']; known: AgentChannel[]; onClose: () => void }) {
  const [link, setLink] = useState<AgentLinkCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [linked, setLinked] = useState<AgentChannel | null>(null);
  const before = useRef(known);
  const label = CHANNEL_LABEL[kind];

  const request = async () => {
    setError(null);
    setExpired(false);
    setLink(null);
    try {
      setLink(await createAgentChannel(token, kind));
    } catch (e) {
      setError(friendlyError(e));
    }
  };
  useEffect(() => {
    void request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wait for the message: the profile is polled until a new phone of this kind shows up.
  useEffect(() => {
    if (!link || linked || expired) return;
    const t = setInterval(() => {
      if (isExpired(link.expiresAt)) return setExpired(true);
      void loadAgent(token, true).then((s) => {
        const found = s.status === 'ready' ? newChannel(before.current, s.data.agent.channels, kind) : null;
        if (found) setLinked(found);
      });
    }, 3000);
    return () => clearInterval(t);
  }, [link, linked, expired, token, kind]);
  useEffect(() => {
    if (!linked) return;
    const t = setTimeout(onClose, 1800);
    return () => clearTimeout(t);
  }, [linked, onClose]);

  return (
    <Modal
      title={`Per ${label} verbinden`}
      onClose={onClose}
      footer={
        <button className="w-btn" onClick={onClose}>
          Schließen
        </button>
      }
    >
      <p className="ag-dialog-lead">
        Scanne den Code mit deinem Handy. {kind === 'sms' ? 'Die Nachrichten-App' : 'WhatsApp'} öffnet sich mit einer fertigen Nachricht, die du nur noch abschicken musst.
      </p>
      {error ? (
        <LoadError message={error} onRetry={() => void request()} />
      ) : linked ? (
        <div className="ag-linked" role="status">
          <IconCheck size={20} /> Verbunden mit {linked.address}
        </div>
      ) : !link ? (
        <Busy className="ag-qr-wrap">
          <Skeleton w={208} h={208} />
          <Skeleton h={13} w={190} />
        </Busy>
      ) : expired ? (
        <div className="ag-qr-wrap">
          <span className="w-muted">Der Code ist abgelaufen.</span>
          <button className="w-btn" onClick={() => void request()}>
            Neuen Code anfordern
          </button>
        </div>
      ) : (
        <div className="ag-qr-wrap">
          <QrCode value={link.link} />
          <span className="ag-waiting" role="status">
            <span className="ws-spinner" aria-hidden="true" /> Warte auf deine Nachricht …
          </span>
          <span className="ag-fallback">
            Keine Kamera? Schreib <code>{link.code}</code>
            <CopyButton value={link.code} label="Code kopieren" /> an <code>{link.number}</code>
          </span>
        </div>
      )}
    </Modal>
  );
}
