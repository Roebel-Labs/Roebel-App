// Side panel of the Start page for the day's briefing: "Audio" (player) and "Text" (the full document).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Md } from '../persona/Md';
import '../persona/persona.css';
import { Busy, Skeleton } from '../ui/Skeleton';
import { Tip } from '../ui/Tooltip';
import { IconBack15, IconClose, IconExpand, IconForward15, IconPause, IconPlay, IconShrink } from '../ui/shell/line-icons';
import { fetchBriefingAudio } from './api';
import { docChapters, fmtClock, nextSpeed, type Chapter } from './briefing-format';

export interface BriefingDoc {
  doc: string;
  title: string;
  audio: boolean;
}
export type BriefingTab = 'audio' | 'text';

const speech = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

/** A German voice of the device, the default one first. */
function germanVoice(): SpeechSynthesisVoice | null {
  const voices = speech()?.getVoices() ?? [];
  const de = voices.filter((v) => /^de(-|_|$)/i.test(v.lang));
  return de.find((v) => v.default) ?? de.find((v) => /de-DE/i.test(v.lang)) ?? de[0] ?? null;
}

export function BriefingPanel({
  token, briefing, tab, onTab, onClose, wide, onWide, onWiki,
}: {
  token: string;
  briefing: BriefingDoc;
  tab: BriefingTab;
  onTab: (t: BriefingTab) => void;
  onClose: () => void;
  wide: boolean;
  onWide: (w: boolean) => void;
  onWiki: (slug: string) => void;
}) {
  return (
    <div className="ws-panel-card ws-brief-panel">
      <header className="ws-panel-head">
        <strong className="w-ellipsis">Tagesbriefing</strong>
        <span className="ws-tools-spacer" />
        <Tip label={wide ? 'Verkleinern' : 'Auf ganze Breite'} side="bottom">
          <button className="w-icon" aria-label={wide ? 'Verkleinern' : 'Auf ganze Breite'} onClick={() => onWide(!wide)}>
            {wide ? <IconShrink size={16} /> : <IconExpand size={16} />}
          </button>
        </Tip>
        <Tip label="Schließen" side="bottom">
          <button className="w-icon" aria-label="Schließen" onClick={onClose}>
            <IconClose size={16} />
          </button>
        </Tip>
      </header>
      <div className="ws-brief-tabs" role="tablist">
        {(['audio', 'text'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => onTab(t)}>
            {t === 'audio' ? 'Audio' : 'Text'}
          </button>
        ))}
      </div>
      {/* The player stays mounted while the text is shown, so reading along does not stop the audio. */}
      <div className="ws-brief-pane" hidden={tab !== 'audio'}>
        <Player token={token} briefing={briefing} />
      </div>
      {tab === 'text' && (
        <div className="ws-brief-pane ws-brief-text">
          <h2>{briefing.title}</h2>
          <Md source={briefing.doc} onWiki={onWiki} />
        </div>
      )}
    </div>
  );
}

type Source = { kind: 'loading' } | { kind: 'server'; url: string } | { kind: 'device' } | { kind: 'none' };

function Player({ token, briefing }: { token: string; briefing: BriefingDoc }) {
  const chapters = useMemo(() => docChapters(briefing.doc), [briefing.doc]);
  const [source, setSource] = useState<Source>(briefing.audio ? { kind: 'loading' } : speech() ? { kind: 'device' } : { kind: 'none' });

  // Server audio first; when it is not offered or fails, the device's own voice reads the text.
  useEffect(() => {
    if (!briefing.audio) return;
    let alive = true;
    let url: string | null = null;
    fetchBriefingAudio(token)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setSource({ kind: 'server', url });
      })
      .catch(() => alive && setSource(speech() ? { kind: 'device' } : { kind: 'none' }));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, briefing.audio]);

  if (source.kind === 'loading')
    return (
      <Busy className="ws-player" label="Dein Briefing wird eingesprochen">
        <Skeleton h={24} w="70%" />
        <span className="ws-player-controls" aria-hidden="true">
          <Skeleton h={18} w={44} />
          <Skeleton h={26} w={26} circle />
          <Skeleton h={64} w={64} circle />
          <Skeleton h={26} w={26} circle />
        </span>
        <Skeleton h={4} />
        <span className="w-muted ws-player-note">Dein Briefing wird eingesprochen. Das dauert beim ersten Mal bis zu 30 Sekunden.</span>
        <ChapterList chapters={chapters} />
      </Busy>
    );
  if (source.kind === 'none')
    return (
      <div className="ws-player">
        <span className="w-muted">Vorlesen ist auf diesem Gerät nicht möglich. Unter „Text“ kannst du das Briefing lesen.</span>
      </div>
    );
  return source.kind === 'server' ? <ServerPlayer url={source.url} title={briefing.title} chapters={chapters} /> : <DevicePlayer title={briefing.title} chapters={chapters} />;
}

function ChapterList({ chapters, current, onPick }: { chapters: Chapter[]; current?: number; onPick?: (i: number) => void }) {
  if (chapters.length < 2) return null;
  return (
    <ol className="ws-chapters">
      {chapters.map((c, i) => (
        <li key={i}>
          {onPick ? (
            <button aria-current={current === i ? 'true' : undefined} onClick={() => onPick(i)}>
              {c.title}
            </button>
          ) : (
            <span>{c.title}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function Controls({ playing, speed, onToggle, onSpeed, onSeek }: { playing: boolean; speed: number; onToggle: () => void; onSpeed: () => void; onSeek?: (delta: number) => void }) {
  return (
    <div className="ws-player-controls">
      <Tip label="Tempo" side="top">
        <button className="ws-player-speed" aria-label={`Tempo ${speed}x`} onClick={onSpeed}>
          {String(speed).replace('.', ',')}x
        </button>
      </Tip>
      {onSeek && (
        <Tip label="15 Sekunden zurück" side="top">
          <button className="w-icon" aria-label="15 Sekunden zurück" onClick={() => onSeek(-15)}>
            <IconBack15 size={22} />
          </button>
        </Tip>
      )}
      <Tip label={playing ? 'Pause' : 'Abspielen'} side="top">
        <button className="ws-player-play" aria-label={playing ? 'Pause' : 'Abspielen'} onClick={onToggle}>
          {playing ? <IconPause size={26} /> : <IconPlay size={26} />}
        </button>
      </Tip>
      {onSeek && (
        <Tip label="15 Sekunden vor" side="top">
          <button className="w-icon" aria-label="15 Sekunden vor" onClick={() => onSeek(15)}>
            <IconForward15 size={22} />
          </button>
        </Tip>
      )}
    </div>
  );
}

function ServerPlayer({ url, title, chapters }: { url: string; title: string; chapters: Chapter[] }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  const el = () => audio.current;
  const toggle = () => {
    const a = el();
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  };
  const seek = (delta: number) => {
    const a = el();
    if (a) a.currentTime = Math.min(Math.max(0, a.currentTime + delta), Number.isFinite(a.duration) ? a.duration : a.currentTime + delta);
  };
  const total = Number.isFinite(duration) ? duration : 0;

  return (
    <div className="ws-player">
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
      />
      <strong className="ws-player-title">{title}</strong>
      <Controls playing={playing} speed={speed} onToggle={toggle} onSpeed={() => setSpeed(nextSpeed)} onSeek={seek} />
      <input
        className="ws-player-bar"
        type="range"
        min={0}
        max={total || 1}
        step={0.1}
        value={Math.min(time, total || 1)}
        aria-label="Position"
        style={{ ['--done' as string]: `${total ? (time / total) * 100 : 0}%` }}
        onChange={(e) => {
          const a = el();
          if (a) a.currentTime = Number(e.target.value);
        }}
      />
      <div className="ws-player-times">
        <span>{fmtClock(time)}</span>
        <span>-{fmtClock(total - time)}</span>
      </div>
      <ChapterList chapters={chapters} />
    </div>
  );
}

/** Reads the briefing with the device's own German voice, chapter by chapter. */
function DevicePlayer({ title, chapters }: { title: string; chapters: Chapter[] }) {
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  // A run id tells the callbacks of cancelled utterances apart from the current ones.
  const run = useRef(0);

  const stop = () => {
    run.current++;
    speech()?.cancel();
    setPlaying(false);
  };
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps

  const speakFrom = (from: number, rate: number) => {
    const s = speech();
    if (!s || chapters.length === 0) return;
    const mine = ++run.current;
    s.cancel();
    const voice = germanVoice();
    chapters.slice(from).forEach((c, k) => {
      const u = new SpeechSynthesisUtterance(c.text);
      u.lang = voice?.lang ?? 'de-DE';
      if (voice) u.voice = voice;
      u.rate = rate;
      u.onstart = () => mine === run.current && setIndex(from + k);
      u.onend = () => {
        if (mine === run.current && from + k === chapters.length - 1) {
          setPlaying(false);
          setIndex(0);
        }
      };
      s.speak(u);
    });
    setIndex(from);
    setPlaying(true);
  };

  const toggle = () => {
    const s = speech();
    if (!s) return;
    if (playing) {
      s.pause();
      setPlaying(false);
    } else if (s.paused && s.speaking) {
      s.resume();
      setPlaying(true);
    } else speakFrom(index, speed);
  };
  const changeSpeed = () => {
    const next = nextSpeed(speed);
    setSpeed(next);
    // The rate of a running utterance cannot change: the current chapter starts again at the new speed.
    if (playing) speakFrom(index, next);
  };

  return (
    <div className="ws-player">
      <strong className="ws-player-title">{title}</strong>
      <Controls playing={playing} speed={speed} onToggle={toggle} onSpeed={changeSpeed} />
      <span className="w-muted ws-player-note">Vorgelesen mit der Stimme deines Geräts</span>
      <ChapterList chapters={chapters} current={index} onPick={(i) => speakFrom(i, speed)} />
    </div>
  );
}
