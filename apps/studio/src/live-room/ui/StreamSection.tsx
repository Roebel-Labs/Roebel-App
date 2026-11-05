// Cloudflare live input (the app's stream) + simulcast outputs. Credentials only live in this
// component's memory while it is mounted; they are never persisted or put into the show state.

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../../ui/Dialog';
import { LiveApiError } from '../api';
import { liveRoom } from '../controller';
import { cfDestinations, OUTPUT_PRESETS, outputLabel } from '../destinations';
import { liveRoomSeams } from '../seams';
import type { CfInputInfo, CfOutput } from '../types';
import { CopyField, ErrorLine, Section, useLiveRoom, useRun } from './common';

function useSeams() {
  const [s, setS] = useState(liveRoomSeams.get());
  useEffect(() => liveRoomSeams.subscribe(() => setS(liveRoomSeams.get())), []);
  return s;
}

function stateText(info: CfInputInfo): { text: string; tone: 'ok' | 'warn' | 'off' } {
  if (info.connected) return { text: 'Signal kommt an', tone: 'ok' };
  if (info.state === 'connected') return { text: 'Verbunden', tone: 'ok' };
  if (info.state === 'reconnecting') return { text: 'Verbindet neu …', tone: 'warn' };
  return { text: 'Kein Signal', tone: 'off' };
}

function Outputs() {
  const [outputs, setOutputs] = useState<CfOutput[] | null>(null);
  const [preset, setPreset] = useState(OUTPUT_PRESETS[0].id);
  const [url, setUrl] = useState(OUTPUT_PRESETS[0].url);
  const [key, setKey] = useState('');
  const [del, setDel] = useState<CfOutput | null>(null);
  const list = useRun();
  const add = useRun();

  const reload = () => list.run(async () => setOutputs((await liveRoom.cf<{ outputs: CfOutput[] }>('cf_list_outputs')).outputs));
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="lr-sub">
      <div className="lr-row">
        <strong>Weiterleitungen</strong>
        <span className="hint">Cloudflare sendet den Stream zusätzlich an diese Plattformen.</span>
        <button className="btn ghost lr-push" onClick={() => void reload()} disabled={list.busy}>
          Aktualisieren
        </button>
      </div>
      {outputs && outputs.length === 0 && <span className="hint">Noch keine Weiterleitung.</span>}
      {outputs?.map((o) => (
        <div key={o.uid} className="lr-item">
          <span className="lr-grow">{outputLabel(o.url)}</span>
          <span className="hint">{o.enabled ? (o.state === 'connected' ? 'sendet' : 'bereit') : 'aus'}</span>
          <button className="btn ghost" onClick={() => setDel(o)}>
            Entfernen
          </button>
        </div>
      ))}
      <div className="lr-form">
        <select
          className="input"
          value={preset}
          onChange={(e) => {
            setPreset(e.target.value);
            setUrl(OUTPUT_PRESETS.find((p) => p.id === e.target.value)?.url ?? '');
          }}
        >
          {OUTPUT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {preset === 'custom' && (
          <input className="input" spellCheck={false} placeholder="rtmps://…" value={url} onChange={(e) => setUrl(e.target.value.trim())} />
        )}
        <input
          className="input lr-grow"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Streamschlüssel der Plattform"
          value={key}
          onChange={(e) => setKey(e.target.value.trim())}
        />
        <button
          className="btn"
          disabled={add.busy || !key || !/^rtmps?:\/\//.test(url)}
          onClick={() =>
            void add
              .run(() => liveRoom.cf('cf_add_output', { url, stream_key: key }))
              .then((ok) => {
                if (ok) {
                  setKey('');
                  void reload();
                }
              })
          }
        >
          Hinzufügen
        </button>
      </div>
      <ErrorLine text={list.error ?? add.error} />
      {del && (
        <ConfirmDialog
          title="Weiterleitung entfernen?"
          body={<p>{outputLabel(del.url)} bekommt den Stream dann nicht mehr.</p>}
          confirmLabel="Entfernen"
          danger
          onCancel={() => setDel(null)}
          onConfirm={() => {
            const o = del;
            setDel(null);
            void list.run(() => liveRoom.cf('cf_delete_output', { output_id: o.uid })).then(() => void reload());
          }}
        />
      )}
    </div>
  );
}

export function StreamSection() {
  const lr = useLiveRoom();
  const seams = useSeams();
  const [info, setInfo] = useState<CfInputInfo | null>(null);
  const [taken, setTaken] = useState<string | null>(null);
  const fetchRun = useRun();

  // Credentials belong to one show; drop them on switch.
  useEffect(() => setInfo(null), [lr.show?.id]);

  const fetchInfo = () =>
    fetchRun.run(async () => {
      try {
        setInfo(await liveRoom.cf<CfInputInfo>('cf_input_info'));
      } catch (e) {
        if (!(e instanceof LiveApiError) || e.code !== 'NO_INPUT') throw e;
        await liveRoom.cf('cf_create_input');
        setInfo(await liveRoom.cf<CfInputInfo>('cf_input_info'));
      }
    });

  // Signal state every 10 s while the credentials are on screen.
  useEffect(() => {
    if (!info) return;
    const t = setInterval(() => {
      liveRoom.cf<CfInputInfo>('cf_input_info').then(setInfo, () => {});
    }, 10_000);
    return () => clearInterval(t);
  }, [info !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lr.show) return null;
  const dests = info ? cfDestinations(info) : null;
  const st = info ? stateText(info) : null;

  return (
    <Section
      title="Sendeziel Röbel App"
      aside={
        st && (
          <span className={`lr-badge ${st.tone}`}>
            <span className="lr-dot" />
            {st.text}
          </span>
        )
      }
    >
      {!info ? (
        <div className="lr-row">
          <button className="btn" onClick={() => void fetchInfo()} disabled={fetchRun.busy || !lr.token}>
            {fetchRun.busy ? 'Hole …' : 'Zugangsdaten holen'}
          </button>
          <span className="hint">Legt bei Bedarf den Cloudflare-Eingang an. Die Daten werden nicht gespeichert.</span>
        </div>
      ) : (
        <>
          <CopyField label="SRT-Adresse (komplett)" value={dests?.srt?.kind === 'srt' ? dests.srt.url : null} secret />
          <CopyField label="RTMPS-Adresse" value={info.rtmps_url} />
          <CopyField label="Streamschlüssel" value={info.stream_key} secret />
          {seams.addDestination ? (
            <div className="lr-row">
              {dests?.srt && (
                <button
                  className="btn"
                  onClick={() => {
                    seams.addDestination!(dests.srt!);
                    setTaken('SRT');
                  }}
                >
                  SRT als Ziel übernehmen
                </button>
              )}
              {dests?.rtmps && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    seams.addDestination!(dests.rtmps!);
                    setTaken('RTMPS');
                  }}
                >
                  RTMPS als Ziel übernehmen
                </button>
              )}
              {taken && <span className="hint">{taken}-Ziel übernommen – in Einstellungen einschalten.</span>}
            </div>
          ) : (
            <p className="hint lr-note">
              So kommt das Bild in die App: <strong>Einstellungen → Sendeziel</strong> öffnen, <strong>SRT</strong> wählen und die
              kopierte SRT-Adresse einfügen. Alternativ <strong>RTMPS</strong> wählen und Adresse und Streamschlüssel einfügen. Gilt ab dem
              nächsten Sendestart.
            </p>
          )}
          <div className="lr-row">
            <button className="btn ghost" onClick={() => setInfo(null)}>
              Zugangsdaten ausblenden
            </button>
          </div>
          <Outputs />
        </>
      )}
      <ErrorLine text={fetchRun.error} />
    </Section>
  );
}
