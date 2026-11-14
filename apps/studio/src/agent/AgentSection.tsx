// "Assistent": the agents page. The person's agents (default assistant + illustrated character agents), the
// selected one's profile (Ansehen / Teilen / Ändern), and for the main assistant its name, mailbox, phones,
// personality and tools. Not a rail
// item; opened from the agent card on Start and from the account menu.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import { locale, t } from '../i18n';
import meckyUrl from '../assets/mecky-welcome.png';
import { Confirm, LoadError, Modal, SignedOutHint, Toggle, useSessionToken } from '../persona/common';
import { fmtDate, friendlyError } from '../persona/format';
import { hintSkillsTab } from '../persona/intent';
import '../persona/persona.css';
import { Busy, SkLines, SkRows, Skeleton } from '../ui/Skeleton';
import { Tip } from '../ui/Tooltip';
import { IconCheck, IconCopy, IconPlus, IconRefresh, IconShare, IconSms, IconView, IconWhatsapp } from '../ui/shell/line-icons';
import type { Section } from '../ui/shell/nav';
import {
  confirmAgentEmailCode, createAgentChannel, createCharacterAgent, deleteAgentChannel, deleteCharacterAgent, fetchMe, patchAgent, patchCharacterAgent, requestAgentEmailCode,
  type Agent, type AgentChannel, type AgentLinkCode, type AgentPatch, type AgentPersonality, type AgentResponse, type AgentSummary,
} from '../workspace/api';
import { BotAvatar, botInitial, isMecky } from '../workspace/BotAvatar';
import { AgentView, ShareDialog } from './AgentShowcase';
import { CharacterPicker, type PickerResult } from './CharacterPicker';
import { CHARACTERS, characterById, roleLine } from './characters';
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

function CopyButton({ value, label: given }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const label = given ?? t('Kopieren');
  return (
    <Tip label={done ? t('Kopiert') : label} side="top">
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
          {session.state === 'signed-out' && <SignedOutHint what={t('die Einstellungen deines Assistenten')} />}
          {(session.state === 'loading' || (token && state.status === 'loading')) && <AgentSkeleton />}
          {token && state.status === 'unavailable' && <div className="pz-state w-muted">{t('Die Seite deines Assistenten ist auf diesem Server noch nicht verfügbar.')}</div>}
          {token && state.status === 'error' && <LoadError message={state.message} onRetry={() => void loadAgent(token)} />}
          {token && state.status === 'ready' && <AgentPage token={token} data={state.data} owner={owner} onNavigate={onNavigate} />}
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

type Overlay = { kind: 'view' | 'share' } | { kind: 'pick'; mode: 'add' | 'change' } | { kind: 'remove' } | null;

function AgentPage({ token, data, owner, onNavigate }: { token: string; data: AgentResponse; owner: string | null; onNavigate: (s: Section) => void }) {
  const agent = data.agent;
  const personalities = data.personalities ?? [];
  // Older servers send no list: the main assistant is the only agent.
  const agents: AgentSummary[] = data.agents?.length
    ? data.agents
    : [{ botId: agent.botId, name: agent.name, characterId: agent.characterId ?? null, role: agent.description, isMain: true, isPreset: agent.isPreset ?? true, personality: agent.personality, since: agent.since }];
  const canAdd = Boolean(data.agents);
  const [selectedId, setSelectedId] = useState<string>(agent.botId);
  const selected = agents.find((a) => a.botId === selectedId) ?? agents.find((a) => a.isMain) ?? agents[0];
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);

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
  /** Runs a request that answers with the full view; returns an error message or null. */
  const run = async (key: string, req: () => Promise<AgentResponse>): Promise<string | null> => {
    setSaving(key);
    setError(null);
    try {
      setAgentData(await req());
      return null;
    } catch (e) {
      return friendlyError(e);
    } finally {
      setSaving(null);
    }
  };

  const character = characterById(selected.characterId);
  const isMain = selected.isMain;
  const name = isMain ? agent.name : selected.name;
  const showcase = { name, character };
  const phone = agent.phone.sms.number || agent.phone.whatsapp.number;
  const mainName = agents.find((a) => a.isMain)?.name ?? agent.name;
  const word = character?.feminine ? 'Agentin' : character ? 'Agent' : 'Assistent';

  const onPicked = async (r: PickerResult): Promise<string | null> => {
    if (overlay?.kind !== 'pick') return null;
    let failed: string | null;
    if (overlay.mode === 'change' && !selected.isPreset) {
      failed = await run('pick', () => patchCharacterAgent(token, selected.botId, { character: r.character, name: r.name, personality: r.personality }));
      // The main assistant's personality lives on the profile.
      if (!failed && isMain && r.personality !== agent.personality) failed = await save('personality', { personality: r.personality });
    } else {
      // A new agent; "Ändern" on the default assistant makes the new one the main assistant.
      const main = overlay.mode === 'change' && isMain;
      let created: string | undefined;
      failed = await run('pick', async () => {
        const res = await createCharacterAgent(token, { character: r.character, name: r.name, personality: r.personality, main });
        created = res.createdId;
        return res;
      });
      if (!failed && created) setSelectedId(created);
    }
    if (!failed) setOverlay(null);
    return failed;
  };

  return (
    <>
      {(agents.length > 1 || canAdd) && (
        <nav className="ag-roster" aria-label={t('Deine Agenten')}>
          {agents.map((a) => {
            const c = characterById(a.characterId);
            return (
              <button key={a.botId} className="ag-roster-item" aria-current={a.botId === selected.botId} onClick={() => setSelectedId(a.botId)}>
                <BotAvatar bot={{ id: a.botId, name: a.name, avatar: c ? { character: c.id } : null }} size={40} radius={10} />
                <span className="ag-roster-text">
                  <strong>{a.isMain ? agent.name : a.name}</strong>
                  <span className="w-muted">{a.isMain ? t('Hauptassistent') : c ? roleLine(c) : a.role}</span>
                </span>
              </button>
            );
          })}
          {canAdd && (
            <button className="ag-roster-item add" onClick={() => setOverlay({ kind: 'pick', mode: 'add' })}>
              <span className="ag-roster-plus" aria-hidden="true">
                <IconPlus size={18} />
              </span>
              <span className="ag-roster-text">
                <strong>{t('Agent hinzufügen')}</strong>
                <span className="w-muted">{t('{n} Figuren', { n: CHARACTERS.length })}</span>
              </span>
            </button>
          )}
        </nav>
      )}

      <header className="ag-head">
        {character ? (
          <img className="ag-figure" src={character.figure} alt="" draggable={false} />
        ) : selected.isPreset || isMecky({ id: selected.botId, name: agent.defaultName }) ? (
          <img className="ag-figure" src={meckyUrl} alt="" draggable={false} />
        ) : (
          <span className="ag-figure initial" aria-hidden="true">
            {botInitial(name)}
          </span>
        )}
        <div className="ag-head-text">
          <h1 className="ag-name">{name}</h1>
          {isMain && (agent.mail.address || phone) && <span className="ag-address">{[agent.mail.address, phone].filter(Boolean).join(' • ')}</span>}
          <span className="w-muted">
            {character ? `${roleLine(character)} · ` : ''}
            {t(word)}
            {owner ? ` ${t('von {owner}', { owner })}` : ''}
            {fmtDate(selected.since) ? ` ${t('seit {date}', { date: fmtDate(selected.since) })}` : ''}
          </span>
          <div className="ag-actions">
            <button className="w-btn" onClick={() => setOverlay({ kind: 'view' })}>
              <IconView size={16} /> {t('Ansehen')}
            </button>
            <button className="w-btn" onClick={() => setOverlay({ kind: 'share' })}>
              <IconShare size={16} /> {t('Teilen')}
            </button>
            {canAdd && (
              <button className="w-btn" onClick={() => setOverlay({ kind: 'pick', mode: 'change' })}>
                <IconRefresh size={16} /> {t('Ändern')}
              </button>
            )}
          </div>
        </div>
      </header>
      {error && <div className="ws-error">{error}</div>}

      {isMain ? (
        <>
          <section className="ag-card">
            <h2>{t('Name und Kontakt')}</h2>
            <NameField agent={agent} busy={saving === 'name'} onSave={(n) => saveOrShow('name', { name: n })} />
            <MailBlock token={token} agent={agent} saving={saving} save={save} onError={setError} />
          </section>

          <PhoneCard token={token} agent={agent} onError={setError} />

          <section className="ag-card">
            <h2>{t('Persönlichkeit')}</h2>
            {personalities.length > 0 && (
              <>
                <h3>{t('Wähle eine Persönlichkeit')}</h3>
                <PersonalityPresets personalities={personalities} value={agent.personality} busy={saving === 'personality'} onPick={(key) => void saveOrShow('personality', { personality: key })} />
              </>
            )}
            <Instructions agent={agent} busy={saving === 'instructions'} onSave={(customInstructions) => saveOrShow('instructions', { customInstructions })} />
            <h3>{t('So klingt dein Name')}</h3>
            <p className="ag-hint">{t('Schreib deinen Namen so, wie er klingt, etwa „Niew“ für Niamh. Dein Assistent richtet sich danach, wenn er dich anspricht.')}</p>
            <BlurInput value={agent.spokenName} placeholder={t('Optional')} maxLength={80} ariaLabel={t('So klingt dein Name')} onSave={(spokenName) => saveOrShow('spoken', { spokenName })} />
          </section>

          <section className="ag-card">
            <h2>{t('Funktionen')}</h2>
            <p className="ag-hint">{t('Das darf dein Assistent nutzen. Welche Dienste verbunden sind, legst du unter Funktionen fest.')}</p>
            {agent.tools.length === 0 ? (
              <div className="w-muted">{t('Keine Werkzeuge freigeschaltet.')}</div>
            ) : (
              <ul className="ag-tools">
                {agent.tools.map((tool) => (
                  <li key={tool}>
                    <IconCheck size={15} /> {toolLabel(tool)}
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
              {t('Integrationen verwalten')} <span aria-hidden="true">→</span>
            </button>
          </section>
        </>
      ) : (
        <>
          <section className="ag-card">
            <h2>{t('Name')}</h2>
            <BlurInput
              value={selected.name}
              placeholder={character?.name}
              maxLength={30}
              ariaLabel={t('Name von {name}', { name: selected.name })}
              disabled={saving === 'agent-name'}
              onSave={(n) => void run('agent-name', () => patchCharacterAgent(token, selected.botId, { name: n })).then((f) => f && setError(f))}
            />
            <p className="ag-hint">
              {t(
                character?.feminine
                  ? 'E-Mail, Telefon und Tagesbriefing laufen über deinen Hauptassistenten {main}. Mach {name} zum Hauptassistenten, damit diese Wege bei ihr ankommen.'
                  : 'E-Mail, Telefon und Tagesbriefing laufen über deinen Hauptassistenten {main}. Mach {name} zum Hauptassistenten, damit diese Wege bei ihm ankommen.',
                { main: mainName, name: selected.name },
              )}
            </p>
            <div className="ag-row-actions">
              <button className="w-btn green" disabled={saving === 'main'} onClick={() => void saveOrShow('main', { botId: selected.botId })}>
                {t('Zum Hauptassistenten machen')}
              </button>
              <button className="w-btn danger" onClick={() => setOverlay({ kind: 'remove' })}>
                {t('Entfernen')}
              </button>
            </div>
          </section>
          <section className="ag-card">
            <h2>{t('Persönlichkeit')}</h2>
            <PersonalityPresets
              personalities={personalities}
              value={selected.personality}
              busy={saving === 'agent-personality'}
              onPick={(key) => void run('agent-personality', () => patchCharacterAgent(token, selected.botId, { personality: key })).then((f) => f && setError(f))}
            />
          </section>
        </>
      )}

      {overlay?.kind === 'view' && <AgentView agent={showcase} onClose={() => setOverlay(null)} onShare={() => setOverlay({ kind: 'share' })} />}
      {overlay?.kind === 'share' && <ShareDialog agent={showcase} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'pick' && (
        <CharacterPicker
          initialCharacter={overlay.mode === 'change' ? selected.characterId : null}
          initialName={overlay.mode === 'change' && character ? name : undefined}
          initialPersonality={overlay.mode === 'change' ? selected.personality : undefined}
          personalities={personalities}
          mailAddress={overlay.mode === 'change' && isMain ? agent.mail.address : null}
          ownerEmail={agent.mail.ownerVerified ? agent.mail.ownerEmail : null}
          confirmVerb={overlay.mode === 'add' ? 'Hinzufügen' : 'Bestätigen'}
          onClose={() => setOverlay(null)}
          onConfirm={onPicked}
        />
      )}
      {overlay?.kind === 'remove' && (
        <Confirm
          title={t('{name} entfernen?', { name: selected.name })}
          body={t('Gespräche und Routinen von {name} bleiben erhalten und laufen ab jetzt über Mecky.', { name: selected.name })}
          confirmLabel={t('Entfernen')}
          busy={saving === 'remove'}
          onCancel={() => setOverlay(null)}
          onConfirm={() =>
            void run('remove', () => deleteCharacterAgent(token, selected.botId)).then((f) => {
              if (f) setError(f);
              else setSelectedId(agent.botId);
              setOverlay(null);
            })
          }
        />
      )}
    </>
  );
}

function PersonalityPresets({ personalities, value, busy, onPick }: { personalities: AgentPersonality[]; value: string; busy: boolean; onPick: (key: string) => void }) {
  return (
    <div className="ag-presets" role="radiogroup" aria-label={t('Persönlichkeit')}>
      {personalities.map((p) => (
        <button key={p.key} className="ag-preset" role="radio" aria-checked={value === p.key} disabled={busy} onClick={() => value !== p.key && onPick(p.key)}>
          <span className="ag-preset-mark" aria-hidden="true">
            {value === p.key && <IconCheck size={14} />}
          </span>
          <span className="ag-preset-text">
            <strong>{p.title}</strong>
            <span className="w-muted">{p.description}</span>
          </span>
        </button>
      ))}
    </div>
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
      <BlurInput value={agent.name} placeholder={agent.defaultName} maxLength={40} ariaLabel={t('Name deines Assistenten')} disabled={busy} onSave={(v) => onSave(v || null)} />
      <p className="ag-hint">{t('So heißt dein Assistent überall in Ortis. Leer lassen stellt „{name}“ wieder her.', { name: agent.defaultName })}</p>
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
      <h3>{t('E-Mail-Adresse deines Assistenten')}</h3>
      {off && <p className="ag-hint">{t('E-Mail ist auf diesem Server noch nicht eingerichtet.')}</p>}
      <div className="ag-box">
        {editing ? (
          <form
            className="ag-alias"
            onSubmit={(e) => {
              e.preventDefault();
              void saveAlias();
            }}
          >
            <input className="ag-input mono" value={draft} autoFocus aria-label={t('Adresse vor dem @')} onChange={(e) => setDraft(cleanAlias(e.target.value))} />
            <span className="ag-domain">@{domain}</span>
            <button type="button" className="w-btn" onClick={() => setEditing(false)}>
              {t('Abbrechen')}
            </button>
            <button className="w-btn" disabled={saving === 'alias' || !draft || draft === (mail.alias ?? alias)}>
              {saving === 'alias' ? t('Prüfe …') : t('Übernehmen')}
            </button>
          </form>
        ) : (
          <div className="ag-address-row">
            <code>{mail.address ?? t('Noch keine Adresse')}</code>
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
                  {t('Adresse ändern')}
                </button>
                <CopyButton value={mail.address} label={t('Adresse kopieren')} />
              </>
            )}
          </div>
        )}
        {aliasError && <div className="ws-error">{aliasError}</div>}
        <p className="ag-box-note">
          {mail.ownerEmail ? (
            <>
              {t('Dein Assistent antwortet nur auf E-Mails von')} <strong>{mail.ownerEmail}</strong>. {t('Andere können ihn über diese Adresse nicht erreichen.')}
            </>
          ) : (
            <>{t('Dein Assistent antwortet nur auf E-Mails von deiner bestätigten Adresse. Andere können ihn über diese Adresse nicht erreichen.')}</>
          )}
        </p>
      </div>

      {!off && !mail.ownerVerified && <VerifyEmail token={token} initial={mail.ownerEmail ?? ''} onError={onError} />}

      <SwitchRow title={t('Tagesbriefing per E-Mail')} text={t('Jeden Morgen der Überblick über deinen Tag in deinem Postfach.')} checked={mail.briefing} disabled={off || saving === 'emailBriefing'} onChange={(v) => void toggle('emailBriefing', v)} />
      <SwitchRow title={t('Ergebnisse von Routinen per E-Mail')} text={t('Was deine Routinen erarbeiten, kommt zusätzlich als E-Mail.')} checked={mail.routines} disabled={off || saving === 'emailRoutines'} onChange={(v) => void toggle('emailRoutines', v)} />
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
      <span className="ag-row-state w-muted">{checked ? t('Ein') : t('Aus')}</span>
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
      <strong>{t('Deine E-Mail-Adresse bestätigen')}</strong>
      <span className="w-muted">
        {step === 'email' ? t('Dein Assistent antwortet erst, wenn feststeht, dass die Adresse dir gehört.') : t('Wir haben einen sechsstelligen Code an {email} geschickt.', { email: email.trim() })}
      </span>
      <div className="ag-verify-row">
        {step === 'email' ? (
          <input className="ag-input" type="email" value={email} placeholder={t('du@beispiel.de')} aria-label={t('Deine E-Mail-Adresse')} onChange={(e) => setEmail(e.target.value)} />
        ) : (
          <input className="ag-input mono" inputMode="numeric" value={code} placeholder="123456" maxLength={6} autoFocus aria-label={t('Code aus der E-Mail')} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        )}
        {step === 'code' && (
          <button type="button" className="w-btn" disabled={busy} onClick={() => setStep('email')}>
            {t('Andere Adresse')}
          </button>
        )}
        <button className="w-btn" disabled={busy || (step === 'email' ? !/^\S+@\S+\.\S+$/.test(email.trim()) : code.length !== 6)}>
          {busy ? '…' : step === 'email' ? t('Code senden') : t('Bestätigen')}
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
      <h3>{t('Eigene Anweisungen')}</h3>
      <p className="ag-hint">{t('Was dein Assistent immer beachten soll: Ton, Vorlieben, was er lassen soll.')}</p>
      <textarea className="ag-input ag-textarea" rows={6} value={draft} maxLength={MAX_INSTRUCTIONS} aria-label={t('Eigene Anweisungen')} placeholder={t('z. B. Antworte kurz. Sprich mich mit Du an. Frag nach, bevor du etwas verschickst.')} onChange={(e) => setDraft(e.target.value)} />
      <div className="ag-save">
        <span className="w-muted">
          {t('{n} / {max} Zeichen', { n: draft.length.toLocaleString(locale()), max: MAX_INSTRUCTIONS.toLocaleString(locale()) })}
        </span>
        <button className="w-btn green" disabled={busy || !dirty} onClick={() => onSave(draft.trim())}>
          {busy ? t('Speichere …') : t('Speichern')}
        </button>
      </div>
    </>
  );
}

// German source texts; translated where they are shown.
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
      <h2>{t('Telefon')}</h2>
      {PHONE_ROWS.map((r) => {
        const ready = !!agent.phone[r.kind]?.number;
        return (
          <div key={r.kind} className={`ag-row boxed${ready ? '' : ' off'}`}>
            <span className={`ag-row-icon ${r.kind}`}>{r.icon}</span>
            <div className="ag-row-text">
              <strong>{t(r.title)}</strong>
              <span className="w-muted">{ready ? t(r.text) : t('{channel} ist auf diesem Server noch nicht eingerichtet.', { channel: CHANNEL_LABEL[r.kind] })}</span>
            </div>
            <button className="w-btn" disabled={!ready} onClick={() => setLinking(r.kind)}>
              {t('Verbinden')}
            </button>
          </div>
        );
      })}

      {agent.channels.length > 0 && (
        <>
          <h3>{t('Verbundene Telefone')}</h3>
          <ul className="ag-channels">
            {agent.channels.map((c) => (
              <li key={c.id} className="ag-row">
                <div className="ag-row-text">
                  <strong className="ag-mono">{c.address}</strong>
                  <span className="w-muted">
                    {CHANNEL_LABEL[c.kind] ?? c.kind} · {t('verbunden {date}', { date: fmtDate(c.verifiedAt) })}
                  </span>
                </div>
                <button className="w-btn" disabled={busy === c.id} onClick={() => void remove(c.id)}>
                  {t('Trennen')}
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
    <svg className="ag-qr" width={size} height={size} viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`} role="img" aria-label={t('QR-Code zum Verbinden')} shapeRendering="crispEdges">
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
    const timer = setInterval(() => {
      if (isExpired(link.expiresAt)) return setExpired(true);
      void loadAgent(token, true).then((s) => {
        const found = s.status === 'ready' ? newChannel(before.current, s.data.agent.channels, kind) : null;
        if (found) setLinked(found);
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [link, linked, expired, token, kind]);
  useEffect(() => {
    if (!linked) return;
    const timer = setTimeout(onClose, 1800);
    return () => clearTimeout(timer);
  }, [linked, onClose]);

  return (
    <Modal
      title={t('Per {channel} verbinden', { channel: label })}
      onClose={onClose}
      footer={
        <button className="w-btn" onClick={onClose}>
          {t('Schließen')}
        </button>
      }
    >
      <p className="ag-dialog-lead">
        {t('Scanne den Code mit deinem Handy. {app} öffnet sich mit einer fertigen Nachricht, die du nur noch abschicken musst.', { app: kind === 'sms' ? t('Die Nachrichten-App') : 'WhatsApp' })}
      </p>
      {error ? (
        <LoadError message={error} onRetry={() => void request()} />
      ) : linked ? (
        <div className="ag-linked" role="status">
          <IconCheck size={20} /> {t('Verbunden mit {address}', { address: linked.address })}
        </div>
      ) : !link ? (
        <Busy className="ag-qr-wrap">
          <Skeleton w={208} h={208} />
          <Skeleton h={13} w={190} />
        </Busy>
      ) : expired ? (
        <div className="ag-qr-wrap">
          <span className="w-muted">{t('Der Code ist abgelaufen.')}</span>
          <button className="w-btn" onClick={() => void request()}>
            {t('Neuen Code anfordern')}
          </button>
        </div>
      ) : (
        <div className="ag-qr-wrap">
          <QrCode value={link.link} />
          <span className="ag-waiting" role="status">
            <span className="ws-spinner" aria-hidden="true" /> {t('Warte auf deine Nachricht …')}
          </span>
          <span className="ag-fallback">
            {/* The sentence is one entry; {code} and {number} mark where the two values go. */}
            {t('Keine Kamera? Schreib {code} an {number}')
              .split(/(\{code\}|\{number\})/)
              .map((part, i) =>
                part === '{code}' ? (
                  <Fragment key={i}>
                    <code>{link.code}</code>
                    <CopyButton value={link.code} label={t('Code kopieren')} />
                  </Fragment>
                ) : part === '{number}' ? (
                  <code key={i}>{link.number}</code>
                ) : (
                  part
                ),
              )}
          </span>
        </div>
      )}
    </Modal>
  );
}
