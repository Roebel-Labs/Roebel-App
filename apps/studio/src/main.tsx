// TEMPORARY (Task 1 spike): test-pattern page that proves
// canvas + audio → MediaRecorder → IPC → ffmpeg → SRT, plus local recording.
// Replaced by the real studio UI in a later task.
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { startRecorder } from './output/recorder';
import type { OutputConfig, OutputStatus, OutputTarget } from './state/types';

const W = 1920;
const H = 1080;
const FPS = 30;
const DEFAULT_FFMPEG = '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg';
const DEFAULT_SRT = 'srt://127.0.0.1:9000?mode=caller';
let autostarted = false;

function drawPattern(ctx: CanvasRenderingContext2D, t: number, frame: number) {
  const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  const bw = W / bars.length;
  bars.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * bw, 0, bw + 1, H * 0.66);
  });
  ctx.fillStyle = '#00498B';
  ctx.fillRect(0, H * 0.66, W, H * 0.34);
  // moving box: one sweep per 4 s
  const x = ((t % 4000) / 4000) * (W - 200);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, H * 0.7, 200, 200);
  // sync flash: first 100 ms of every second (the tone beeps at the same time)
  if (t % 1000 < 100) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(W - 260, 40, 220, 220);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 96px Inter, system-ui, sans-serif';
  ctx.fillText(new Date().toLocaleTimeString('de-DE'), 60, H - 80);
  ctx.font = '48px Inter, system-ui, sans-serif';
  ctx.fillText(`Röbel Studio Testbild · Frame ${frame}`, 60, H - 200);
}

function Spike() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<OutputStatus | null>(null);
  const [running, setRunning] = useState(false);
  const envTarget: OutputTarget | null = window.studio.spike.rtmp
    ? { kind: 'rtmp', ...window.studio.spike.rtmp }
    : window.studio.spike.autostart
      ? { kind: 'srt', url: window.studio.spike.autostart }
      : null;
  const [url, setUrl] = useState(envTarget ? '(Ziel aus Umgebung)' : DEFAULT_SRT);
  const [mime, setMime] = useState('');
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const t0 = performance.now();
    let frame = 0;
    // setInterval (not rAF) so drawing continues when the window is occluded.
    const id = setInterval(() => drawPattern(ctx, performance.now() - t0, frame++), 1000 / FPS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => window.studio.output.onStatus(setStatus), []);

  async function start() {
    const canvas = canvasRef.current!;
    const video = canvas.captureStream(FPS);
    const audioCtx = new AudioContext({ sampleRate: 48000 });
    const osc = audioCtx.createOscillator();
    osc.frequency.value = 1000;
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    // beep: 100 ms on at the start of every second, aligned with the visual flash
    const t = audioCtx.currentTime;
    for (let s = 0; s < 3600; s++) {
      gain.gain.setValueAtTime(0.2, t + s);
      gain.gain.setValueAtTime(0, t + s + 0.1);
    }
    const dest = audioCtx.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    const stream = new MediaStream([...video.getVideoTracks(), ...dest.stream.getAudioTracks()]);

    const target: OutputTarget =
      envTarget ?? (url.startsWith('srt://') ? { kind: 'srt', url } : { kind: 'rtmp', url, key: '' });
    const cfg: OutputConfig = {
      target,
      fps: FPS,
      videoKbps: 6000,
      audioKbps: 160,
      recordDir: window.studio.spike.recordDir || '~/Movies/Röbel Studio',
      ffmpegPath: window.studio.spike.ffmpegPath || DEFAULT_FFMPEG,
    };
    await window.studio.output.start(cfg);
    let rec = startRecorder(stream, { videoKbps: cfg.videoKbps });
    setMime(rec.mimeType);
    let restarting = false;
    const offNeedHeader = window.studio.output.onNeedHeader(async () => {
      if (restarting) return;
      restarting = true;
      await rec.stop();
      rec = startRecorder(stream, { videoKbps: cfg.videoKbps });
      restarting = false;
    });
    stopRef.current = async () => {
      offNeedHeader();
      await rec.stop();
      await window.studio.output.stop();
      osc.stop();
      await audioCtx.close();
    };
    setRunning(true);
  }

  async function stop() {
    await stopRef.current?.();
    stopRef.current = null;
    setRunning(false);
  }

  useEffect(() => {
    // StrictMode runs effects twice in dev; autostart exactly once.
    if (envTarget && !autostarted) {
      autostarted = true;
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20 }}>Röbel Studio – Ausgabe-Test</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} style={{ width: 640 }} disabled={running || !!envTarget} />
        {running ? <button onClick={stop}>Stoppen</button> : <button onClick={start}>Senden</button>}
      </div>
      <pre style={{ fontSize: 13 }}>
        {`Format: ${mime || '–'}\n`}
        {status ? JSON.stringify(status, null, 2) : 'Status: –'}
      </pre>
      <canvas ref={canvasRef} width={W} height={H} style={{ width: 960, height: 540, background: '#000' }} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Spike />
  </StrictMode>,
);
