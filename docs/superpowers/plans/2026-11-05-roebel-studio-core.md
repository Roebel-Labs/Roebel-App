# Röbel Studio Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Mac desktop studio (`apps/studio`) that switches cameras and media with transitions, airs live-data
overlays (lower thirds from the table, logo bug, clock, "Als Nächstes", sponsor break spots), mixes audio and sends
one stream to Cloudflare Stream Live (SRT, RTMPS fallback) while recording locally — ready for the 2026-11-06
rehearsal at the DanceCup venue.

**Architecture:** One React + TypeScript renderer (Vite) inside a plain Electron shell. A pure `ShowState` reducer
holds sources, scenes, preview/program, overlays and the table; one Canvas 2D renderer draws both the preview
monitor and the 1920×1080 program canvas from that state, and the same renderer powers the OBS browser-source page.
The program canvas plus the Web Audio master go into a `MediaRecorder` (H.264/Opus in Matroska, high bitrate
mezzanine); chunks travel over IPC to the Electron main process, which writes them to a local recording file and
pipes them into ffmpeg, which re-encodes with `h264_videotoolbox` (fixed GOP, CBR-ish) + AAC and sends MPEG-TS over
SRT (or FLV over RTMPS).

**Tech Stack:** Electron (latest stable), Vite + React 19 + TypeScript, Vitest, Canvas 2D, Web Audio,
MediaRecorder, Homebrew ffmpeg (with libsrt + VideoToolbox), `ws` (local overlay relay), `@supabase/supabase-js`
(sponsor logos), `@fontsource/inter` + `@fontsource/plus-jakarta-sans`.

**Spec:** [`docs/superpowers/specs/2026-10-22-roebel-studio-livestream-design.md`](../specs/2026-10-22-roebel-studio-livestream-design.md)
§4.1–4.6, §5.3. Not in this plan: phone join (§5.2), in-app viewing + donations + chat (§5.4), AI designs (§5.5).
Their hooks are left as typed placeholders only where noted.

## Deviations from the spec (Claude's call, under the 2-day deadline)

- **Canvas 2D instead of PixiJS.** Two 1080p video sources + text overlays are well within Chromium's GPU-backed
  Canvas 2D; one less dependency and simpler text/font handling. The renderer sits behind `renderFrame()`, so Pixi
  can replace it later.
- **MediaRecorder → ffmpeg re-encode instead of WebCodecs → ffmpeg stream copy.** MediaRecorder can't pin the GOP,
  and Cloudflare wants ~2 s keyframes. Re-encoding on VideoToolbox gives a fixed GOP, bitrate and profile for a few
  % CPU on the M3. The local recording keeps the untouched mezzanine stream.
- **Design tab = form editing** (pick template → edit text, colors, image per node, live preview) and no drag
  canvas. The spec marks "Design canvas beyond simple text/color edits" as cut-first.
- **No packaging.** For 7 Nov the studio runs from the repo (`pnpm --filter @roebel/studio start`). An
  electron-builder `.app` comes later.
- **Cut for 7 Nov:** sound-effects board, countdown component, typewriter text animation (all nice-to-have in §2).
- **Donation alerts / chat highlights:** the overlay types exist and can be fired manually. The Supabase feed
  comes with sub-project 4.

## Global Constraints

- Code, identifiers and comments in English; all UI text in German.
- Brand navy `#00498B`; secondary text `#6B7280`; borders `#B4B8C1`; fonts Inter (body) + Plus Jakarta Sans (headings), bundled, never loaded from the network.
- Output default 1920×1080 @ 30 fps, 50 fps selectable; H.264 + AAC; ~6 Mbit/s default, adjustable.
- Transport SRT to Cloudflare Stream Live; RTMPS selectable as fallback.
- Local recording of program output runs whenever the stream is on air.
- Show state autosaves; after a crash or restart the studio reopens exactly where it was (sources, scenes, overlays, table, templates, presets, settings).
- Must run 6+ hours without memory growth or dropped frames on an **Apple M3 MacBook with 8 GB RAM**.
- Ads on air are always labelled "Werbung". Never "Spende" (use "Unterstützen"). No raw wallet addresses anywhere.
- No secrets in the app: only the Supabase URL + publishable (anon) key; stream key/URL is a local setting the operator pastes and is never committed.
- pnpm only. Node via nvm (`source ~/.nvm/nvm.sh`), Node ≥ 20.
- The UI must feel calm (layout A): preview left (green frame), transitions + TAKE middle, live right (red frame); source row, overlay row, audio strip and health bar below. No floating panels.

## Review Focus

1. **Window hidden/minimised or display asleep while on air** → the program must keep rendering at full fps. (`backgroundThrottling: false`, a timer-driven output loop with `captureStream(0)` + `requestFrame()`, and `powerSaveBlocker('prevent-display-sleep')` while on air.) Test: Task 4 output-clock test + Task 12 soak with the window minimised for 5 minutes.
2. **Network drop mid-show** → ffmpeg exits. The studio must reconnect by itself (backoff 1 s → 10 s) and show it, and the local recording must not stop. Test: Task 1 restart-policy test; Task 12 pull the network cable for 30 s.
3. **Camera or capture card unplugged / USB cable wiggle** → its source shows a "Signal verloren" slate instead of freezing the program on a black or stale frame, and recovers by itself when the device comes back (`devicechange`). Test: Task 4 source-status reducer test.
4. **Cross-origin sponsor logos taint the canvas** → the program stream turns black or `captureStream` throws. All images load with `crossOrigin = 'anonymous'`; a logo that fails to load is skipped from rotation, not drawn broken. Test: Task 10 rotation test with a failed logo.
5. **Audio processing mangles music** → getUserMedia audio must be requested with `echoCancellation`, `noiseSuppression`, `autoGainControl` all `false`, and the limiter must keep the master ≤ −1 dBFS. Test: Task 6 constraint-builder test.

---

## File Structure

```
apps/studio/
  package.json            scripts: dev, start, test, typecheck
  vite.config.ts          two entries: index.html (studio), overlay.html (OBS browser source)
  index.html, overlay.html
  electron/
    main.cjs              window, IPC, power blocker, starts output + overlay server
    preload.cjs           contextBridge: window.studio = { output, media, overlay, fs }
    output.cjs            ffmpeg process + recording file + restart policy
    ffmpeg-args.cjs       buildFfmpegArgs(), parseProgress()   (pure, tested)
    overlay-server.cjs    127.0.0.1:7311 — static dist/ + WS state relay + /media/ allowlist
  src/
    state/types.ts        ShowState and all shared types
    state/reducer.ts      showReducer(state, action) (pure, tested)
    state/store.tsx       React context + autosave/restore (localStorage key 'roebel-studio-v1')
    render/bindings.ts    resolveBindings()
    render/anim.ts        easings, overlayProgress(), transitionProgress()
    render/layout.ts      sceneRects()
    render/draw.ts        renderFrame(), drawTemplate(), drawTransition()
    render/templates.ts   starter templates (lowerThird, logoBug, clock, nextUp, breakSpot, pause, donation)
    media/devices.ts      device enumeration, audio constraints
    media/sources.ts      SourceRegistry: deviceId/url → HTMLVideoElement/HTMLImageElement + status
    media/output-clock.ts OutputClock (setInterval-driven, fps, overrun counting)
    audio/mixer.ts        Mixer (Web Audio graph)
    output/recorder.ts    startRecorder(): MediaRecorder → window.studio.output
    sponsors/supporters.ts fetchSupporters(), nextSpot()
    csv.ts                parseCsv()
    ui/App.tsx            tabs Show · Design · Table · Einstellungen
    ui/show/*             Monitors, TransitionBar, SourceRow, OverlayRow, AudioStrip, HealthBar
    ui/table/TableTab.tsx
    ui/design/DesignTab.tsx
    ui/settings/SettingsTab.tsx
    overlay/main.tsx      OBS page: WS → state → renderFrame(overlaysOnly)
  src/**/__tests__/*.test.ts
docs/STUDIO_RUNBOOK.md    setup, Cloudflare live input, OBS fallback, rehearsal checklist, go/no-go
```

---

### Task 1: Scaffold + output pipeline spike (go/no-go for the whole architecture)

The riskiest part comes first. At the end of this task a test-pattern canvas streams to a real ingest and records locally.

**Files:**
- Create: `apps/studio/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx` (temporary test-pattern page), `electron/main.cjs`, `electron/preload.cjs`, `electron/output.cjs`, `electron/ffmpeg-args.cjs`, `src/output/recorder.ts`
- Test: `apps/studio/electron/__tests__/ffmpeg-args.test.ts`, `apps/studio/electron/__tests__/restart-policy.test.ts`

**Interfaces:**
- Produces: `buildFfmpegArgs(o: { target: OutputTarget; fps: 30 | 50; videoKbps: number; audioKbps: number }): string[]`
  where `type OutputTarget = { kind: 'srt'; url: string } | { kind: 'rtmp'; url: string; key: string } | { kind: 'none' }`
- Produces: `parseProgress(line: string): { fps?: number; kbps?: number; speed?: number; dropped?: number } | null`
- Produces: `nextRestartDelay(attempt: number): number` (ms)
- Produces (preload): `window.studio.output.start(cfg: OutputConfig): Promise<void>`, `.chunk(buf: ArrayBuffer): void`, `.stop(): Promise<void>`, `.onStatus(cb: (s: OutputStatus) => void): () => void`
  - `OutputConfig = { target: OutputTarget; fps: 30|50; videoKbps: number; audioKbps: number; recordDir: string; ffmpegPath: string }`
  - `OutputStatus = { state: 'idle'|'connecting'|'live'|'reconnecting'|'error'; since: number; fps?: number; kbps?: number; speed?: number; recordingFile?: string; recordingBytes: number; restarts: number; lastError?: string }`
- Produces: `startRecorder(stream: MediaStream, opts: { videoKbps: number }): { stop(): Promise<void> }` in `src/output/recorder.ts`

- [ ] **Step 1: Prereqs.** `brew install ffmpeg`; verify `ffmpeg -hide_banner -protocols | grep srt` and `ffmpeg -hide_banner -encoders | grep h264_videotoolbox` both print a line.
- [ ] **Step 2: Scaffold** the package `@roebel/studio` (private). Scripts: `dev` (vite on 5175 + electron with `STUDIO_DEV_URL`), `start` (vite build then electron loading `dist/`), `test` (vitest run), `typecheck`. `BrowserWindow` with `backgroundThrottling: false`, `contextIsolation: true`, `sandbox: false` (preload needs ipcRenderer), 1600×1000, title "Röbel Studio".
- [ ] **Step 3: Write failing tests** `ffmpeg-args.test.ts`:
  - SRT target, 30 fps, 6000/160 → args include `-i pipe:0`, `-c:v h264_videotoolbox`, `-b:v 6000k`, `-maxrate 6000k`, `-bufsize 12000k`, `-g 60`, `-r 30`, `-profile:v high`, `-c:a aac`, `-b:a 160k`, `-ar 48000`, `-f mpegts`, and the last arg equals the SRT URL.
  - 50 fps → `-g 100`, `-r 50`.
  - RTMP target `{url:'rtmps://live.cloudflare.com:443/live/', key:'abc'}` → `-f flv` and last arg `rtmps://live.cloudflare.com:443/live/abc`.
  - `{kind:'none'}` → throws `'no_target'`.
  - `parseProgress('frame= 300 fps= 30 q=-0.0 size= 2048kB time=00:00:10.00 bitrate=6012.3kbits/s dup=0 drop=2 speed=1.00x')` → `{ fps: 30, kbps: 6012.3, speed: 1, dropped: 2 }`; `parseProgress('Input #0, matroska')` → `null`.
- [ ] **Step 4: Write failing test** `restart-policy.test.ts`: `nextRestartDelay(0) === 1000`, `(1) === 2000`, `(3) === 8000`, `(10) === 10000` (cap).
- [ ] **Step 5: Run** `pnpm --filter @roebel/studio test`. Expected: FAIL (modules missing).
- [ ] **Step 6: Implement** `ffmpeg-args.cjs` (CommonJS, also importable from vitest) and `output.cjs`. ffmpeg input is `-fflags +genpts -f matroska -i pipe:0`, add `-flush_packets 1`. Recording: main appends every chunk to `<recordDir>/roebel-studio-YYYY-MM-DD_HH-mm-ss.mkv` (a new file per recorder session) **before** writing to ffmpeg stdin, so an ffmpeg crash never loses recording. On ffmpeg exit while `started`: state `reconnecting`, call `onNeedHeader` → renderer restarts the MediaRecorder (fresh Matroska header) after `nextRestartDelay(restarts)`. Ignore `EPIPE` on stdin. Status pushed to the renderer at 1 Hz.
- [ ] **Step 7: Implement** `startRecorder`: `MediaRecorder(stream, { mimeType: 'video/x-matroska;codecs=avc1,opus', videoBitsPerSecond: videoKbps*2*1000, audioBitsPerSecond: 192000 })`, `start(250)`; fall back to `video/webm;codecs=h264,opus` if unsupported; send each `dataavailable` blob as ArrayBuffer to `window.studio.output.chunk`.
- [ ] **Step 8: Run tests.** Expected: PASS.
- [ ] **Step 9: Spike test (manual, real ingest).** Temporary `src/main.tsx` draws a moving test pattern + running clock at 1080p30 into a canvas, adds a 1 kHz oscillator as audio, and streams it. Target 1: `srt://` URL of a Cloudflare Stream live input (Max creates it in the dashboard, see runbook; or a local `ffplay -i 'srt://127.0.0.1:9000?mode=listener'` while it doesn't exist). Pass = picture + tone play in Cloudflare's preview/HLS for 5 minutes, `speed≈1.0x`, a recording `.mkv` that plays in QuickTime/VLC, and killing ffmpeg (`pkill ffmpeg`) reconnects within ~2 s while the recording keeps going. **If this fails, stop and redesign the output layer before Task 2.**
- [ ] **Step 10: Commit** `feat(studio): scaffold + MediaRecorder→ffmpeg SRT output with local recording`.

### Task 2: Show state model + reducer + autosave

**Files:**
- Create: `src/state/types.ts`, `src/state/reducer.ts`, `src/state/store.tsx`
- Test: `src/state/__tests__/reducer.test.ts`

**Interfaces:**
- Produces types:
  - `Source = { id: string; kind: 'camera' | 'video' | 'image' | 'color'; label: string; deviceId?: string; url?: string; color?: string; loop?: boolean; audioChannelId?: string }`
  - `Scene = { id: string; label: string; layout: 'full' | 'pip' | 'split'; sourceIds: string[] }` (full = 1 source, pip/split = 2)
  - `TransitionKind = 'cut' | 'fade' | 'wipe' | 'slide' | 'zoom'`; `TransitionPreset = { id: string; name: string; kind: TransitionKind; durationMs: number; easing: Easing; direction?: 'left'|'right'|'up'|'down' }`
  - `Easing = 'linear' | 'easeInOut' | 'easeOut' | 'backOut'`
  - `OverlayInstance = { id: string; templateId: string; visible: boolean; changedAt: number }`
  - `Table = { columns: string[]; rows: { id: string; values: Record<string, string> }[]; currentRowId: string | null }`
  - `ShowState = { version: 1; sources: Source[]; scenes: Scene[]; previewSceneId: string | null; programSceneId: string | null; transition: { presetId: string; startedAt: number | null; fromSceneId: string | null }; presets: TransitionPreset[]; overlays: OverlayInstance[]; templates: Template[]; table: Table; settings: Settings; sponsors: { rotationSeconds: number } }`
  - `Settings = { target: OutputTarget; fps: 30 | 50; videoKbps: number; audioKbps: number; recordDir: string; ffmpegPath: string; campaignSlug: string }` defaults `{ target:{kind:'none'}, fps:30, videoKbps:6000, audioKbps:160, recordDir:'~/Movies/Röbel Studio', ffmpegPath:'/opt/homebrew/bin/ffmpeg', campaignSlug:'dancecup-2026' }`
- Produces: `showReducer(s: ShowState, a: Action): ShowState`, `initialState(): ShowState`, `serialize(s): string`, `restore(json: string | null): ShowState`
- Actions (discriminated on `type`): `addSource`, `updateSource`, `removeSource` (also removes scenes using it; clears preview/program if affected), `addScene`, `removeScene`, `setPreview`, `take` (payload `now: number`), `cut`, `transitionDone`, `setPreset`, `savePreset`, `toggleOverlay` (`now`), `setOverlay` (`visible`, `now`), `updateTemplate`, `setTable`, `updateCell`, `addRow`, `removeRow`, `selectRow`, `nextRow`, `updateSettings`.

- [ ] **Step 1: Write failing tests:**
  - `addSource` of kind camera also creates a `full` scene for it.
  - `take` with preview A, program B, preset fade 600 → `programSceneId === A`, `previewSceneId === B` (swap like vMix), `transition.fromSceneId === B`, `startedAt === now`.
  - `take` while a transition is running → ignored (state unchanged).
  - `take` with preset `cut` → `startedAt === null`.
  - `nextRow` moves `currentRowId` to the next row; on the last row it stays.
  - `removeSource` of the program source → program null, its scenes gone.
  - `restore('garbage')` and `restore(null)` → `initialState()`; `restore(serialize(s))` deep-equals `s` with `transition.startedAt` reset to `null` and every `overlay.visible` kept.
  - `restore` of a v1 state missing a newer field (e.g. no `sponsors`) fills the default.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Store = `useReducer` + context; autosave `serialize(state)` to `localStorage['roebel-studio-v1']` debounced 500 ms and on `beforeunload`. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(studio): show state model with autosave + crash restore`.

### Task 3: Template format, bindings, animations, renderer

**Files:**
- Create: `src/render/bindings.ts`, `src/render/anim.ts`, `src/render/layout.ts`, `src/render/draw.ts`, `src/render/templates.ts`
- Test: `src/render/__tests__/bindings.test.ts`, `anim.test.ts`, `layout.test.ts`

**Interfaces:**
- Produces types (in `types.ts`):
  - `Template = { id: string; name: string; kind: 'lowerThird'|'logoBug'|'clock'|'nextUp'|'breakSpot'|'pause'|'donation'|'custom'; fullScreen: boolean; nodes: TemplateNode[]; animIn: OverlayAnim; animOut: OverlayAnim }`
  - `TemplateNode = { id: string; type: 'rect'|'text'|'image'; x: number; y: number; w: number; h: number; fill?: string; radius?: number; opacity?: number; text?: string; font?: 'Inter'|'Plus Jakarta Sans'; weight?: 400|600|700|800; size?: number; color?: string; align?: 'left'|'center'|'right'; src?: string; fit?: 'contain'|'cover'; delayMs?: number }` (coordinates in 1920×1080 space)
  - `OverlayAnim = { kind: 'none'|'fade'|'slide'|'scale'|'wipe'; durationMs: number; easing: Easing; from?: 'left'|'right'|'top'|'bottom'; staggerMs?: number }`
  - `RenderContext = { row: Record<string,string> | null; next: Record<string,string> | null; now: Date; sponsor: { name: string; logoUrl: string } | null; donation: { name: string; amount: string; message: string } | null }`
- Produces: `resolveBindings(text: string, rc: RenderContext): string`
- Produces: `ease(e: Easing, t: number): number`; `overlayProgress(o: OverlayInstance, anim: OverlayAnim, nowMs: number): number` (0 hidden … 1 fully in; animates out on hide); `transitionProgress(startedAt: number | null, durationMs: number, nowMs: number): number`
- Produces: `sceneRects(layout: Scene['layout'], W: number, H: number): { x: number; y: number; w: number; h: number }[]` — pip = full + bottom-right inset 30 % with 40 px margin; split = two 50 % halves letterboxed
- Produces: `renderFrame(ctx: CanvasRenderingContext2D, state: ShowState, media: MediaLookup, rc: RenderContext, nowMs: number, opts: { overlaysOnly?: boolean; scale?: number }): void`, `type MediaLookup = (sourceId: string) => { el: CanvasImageSource | null; status: 'ok'|'loading'|'lost' }`
- Produces: `STARTER_TEMPLATES: Template[]` — the 7 kinds above, navy `#00498B`, white text, Plus Jakarta Sans 800 for titles, Inter 600 for subtitles; lower third bound to `{{row.Gruppe}}` / `{{row.Verein}} · {{row.Kategorie}}`; clock `{{time}}`; nextUp `Als Nächstes: {{next.Gruppe}}`; breakSpot full-screen with label text `Werbung` and `{{sponsor.name}}` + image `{{sponsor.logo}}`; pause `Gleich geht's weiter`; donation `{{donation.name}} unterstützt mit {{donation.amount}}`.

- [ ] **Step 1: Write failing tests:**
  - `resolveBindings('{{row.Gruppe}} – {{row.Verein}}', rc)` with row `{Gruppe:'Sunshine Kids', Verein:'TSV Röbel'}` → `'Sunshine Kids – TSV Röbel'`.
  - Missing key / null row → empty string, never the literal `{{…}}` and never `undefined`.
  - `{{time}}` with `now = 2026-11-07T14:05:09` (local) → `'14:05'`.
  - `{{ row.Gruppe }}` (spaces) resolves too; keys are case-sensitive and may contain umlauts (`{{row.Altersklasse Jünger}}` is not needed, but `{{row.Größe}}` is).
  - `ease('linear', .5) === .5`; every easing maps 0→0 and 1→1.
  - `overlayProgress`: visible, changed 0 ms ago, fade 400 → 0; 200 ms → between 0 and 1; 400+ → 1; hidden 200 ms after a hide → between 0 and 1, decreasing; hidden 400+ → 0.
  - `transitionProgress(null, 600, x) === 1`; `(1000, 600, 1300) === 0.5`; clamps at 1.
  - `sceneRects('full',1920,1080)` → `[{x:0,y:0,w:1920,h:1080}]`; `pip` second rect `{w:576,h:324,x:1304,y:716}`; `split` two rects of w 960.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the pure modules, then `draw.ts`: draw program scene (or transition from→to by `kind`: fade = alpha, wipe = clip rect, slide = translate, zoom = scale+alpha), a lost/loading source draws a dark slate with "Signal verloren" / "Lädt…", then visible overlays in order (full-screen ones first), each node drawn with `overlayProgress` applied per `anim.kind` and node `delayMs`/`staggerMs`. Images come from an internal `crossOrigin='anonymous'` image cache keyed by resolved src. Text uses `ctx.font` with the bundled families (wait for `document.fonts.ready` before the first frame). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(studio): template format, bindings, animations and Canvas renderer`.

### Task 4: Capture, sources, output clock

**Files:**
- Create: `src/media/devices.ts`, `src/media/sources.ts`, `src/media/output-clock.ts`, `electron/overlay-server.cjs` (only the `/media/` route in this task)
- Modify: `electron/main.cjs` (media permissions: auto-grant `media` for our own origin; IPC `media:allow(path) → url`)
- Test: `src/media/__tests__/output-clock.test.ts`, `src/media/__tests__/source-status.test.ts`

**Interfaces:**
- Produces: `listDevices(): Promise<{ video: MediaDeviceInfo[]; audio: MediaDeviceInfo[] }>`; `audioConstraints(deviceId: string): MediaTrackConstraints`; `videoConstraints(deviceId: string, fps: 30|50): MediaTrackConstraints` (ideal 1920×1080, ideal fps)
- Produces: `class SourceRegistry { sync(sources: Source[]): void; lookup: MediaLookup; onStatus(cb): () => void; dispose(): void }` — camera → hidden `<video muted playsinline>` from getUserMedia; video → `<video>` from `/media/` URL (loop per source); image → `HTMLImageElement`; listens to `devicechange` and track `ended` → status `lost`, retries every 2 s.
- Produces: `sourceStatus(prev: 'ok'|'loading'|'lost', ev: 'started'|'ended'|'stalled'|'playing'|'deviceGone'|'deviceBack'): 'ok'|'loading'|'lost'` (pure)
- Produces: `class OutputClock { constructor(fps: number, tick: (nowMs: number) => void); start(): void; stop(): void; stats(): { fps: number; overruns: number } }` — `setInterval`-based with drift correction (schedules the next tick on `performance.now()`), counts a tick that runs > 1 frame late as an overrun.
- Produces (preload): `window.studio.media.allow(absPath: string): Promise<string>` → `http://127.0.0.1:7311/media/<token>`

- [ ] **Step 1: Write failing tests:** `sourceStatus('ok','ended') === 'lost'`, `('lost','deviceBack') === 'loading'`, `('loading','playing') === 'ok'`, `('ok','stalled') === 'loading'`. OutputClock with fake timers at 30 fps over 1000 ms → `tick` called 30 ± 1 times; a tick handler that blocks 100 ms once → `overruns ≥ 1` and the clock does not burst-fire the missed ticks.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** The program canvas (1920×1080, offscreen in the DOM) is drawn on each OutputClock tick; `programStream = canvas.captureStream(0)` and `track.requestFrame()` after each draw. Preview/Live monitors are small `<canvas>` elements, redrawn with `requestAnimationFrame` (preview = `renderFrame` of the preview scene; Live = `drawImage(programCanvas)`). **Step 4: Run** → PASS.
- [ ] **Step 5: Manual check:** with the Mac's FaceTime camera + iPhone Continuity Camera + (if available) the capture card, all three appear as sources; unplugging one shows "Signal verloren" within 2 s and comes back on re-plug.
- [ ] **Step 6: Commit** `feat(studio): device capture, media sources and drift-free output clock`.

### Task 5: Show tab UI (switcher, overlays, hotkeys, on-air, health)

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/show/ShowTab.tsx`, `Monitors.tsx`, `TransitionBar.tsx`, `SourceRow.tsx`, `OverlayRow.tsx`, `HealthBar.tsx`, `src/ui/hotkeys.ts`, `src/ui/theme.css`
- Replace: the temporary `src/main.tsx` from Task 1
- Test: `src/ui/__tests__/hotkeys.test.ts`

**Interfaces:**
- Consumes: store (Task 2), `renderFrame` (Task 3), `SourceRegistry`/`OutputClock` (Task 4), `window.studio.output` + `startRecorder` (Task 1)
- Produces: `hotkeyAction(e: { key: string; code: string; target: 'input' | 'other'; shift: boolean }, state: ShowState): Action | 'goLive' | null`

- [ ] **Step 1: Write failing tests:** `Space`/`Enter` → `take`; `c` → `cut`; `1`–`9` → `setPreview` with the n-th scene; `l` → toggle the first lowerThird overlay; `b` → logo bug; `n` → `nextRow`; any key with `target: 'input'` → `null`; `Shift+Enter` → `'goLive'` is **not** bound (going on air needs the button + confirm).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** layout A: tab bar `Show · Design · Tabelle · Einstellungen` + a big status pill (`OFF AIR` grey / `ON AIR 00:12:34` red / `VERBINDE NEU …` amber). Preview monitor with a green border, TransitionBar (preset chips Cut/Blende/Wischen/Schieben/Zoom, duration slider 100–2000 ms, "Als Preset speichern", big `TAKE`), Live monitor with a red border. SourceRow: scene tiles with a live thumbnail, status dot, click = preview, double-click = cut to live, "+ Quelle" (Kamera / Video / Bild / Farbe / Split / Bild-im-Bild). OverlayRow: one toggle tile per overlay instance with in/out state + "+ Overlay" from templates. "Auf Sendung gehen" → confirm dialog showing target + bitrate → start recorder + output; "Sendung beenden" → confirm. HealthBar: output state, fps (render + encoder), kbps, speed, overruns, dropped, recording file size, CPU (`process.getCPUUsage` via IPC), on-air time; red when `speed < 0.95` or render fps < 0.9×target. Calm styling: dark neutral background, 4 px radii, navy accent for the single primary action (TAKE). **Step 4: Run** → PASS.
- [ ] **Step 5: Manual check:** switch 2 cameras with every transition; arm the lower third and take it; hotkeys work; status pill updates; `powerSaveBlocker` is active while on air (`pmset -g assertions | grep -i electron`).
- [ ] **Step 6: Commit** `feat(studio): Show tab — preview/live switcher, transitions, overlays, hotkeys, health`.

### Task 6: Audio mixer

**Files:**
- Create: `src/audio/mixer.ts`, `src/ui/show/AudioStrip.tsx`
- Modify: `src/state/types.ts` + reducer (`AudioChannel` list in `ShowState.audio`)
- Test: `src/audio/__tests__/mixer.test.ts`, extend `src/media/__tests__/devices.test.ts`

**Interfaces:**
- Produces type: `AudioChannel = { id: string; label: string; input: { kind: 'device'; deviceId: string } | { kind: 'source'; sourceId: string }; gainDb: number; muted: boolean; delayMs: number; followsVideoSourceId?: string }`; `ShowState.audio = { channels: AudioChannel[]; masterDb: number }`
- Produces: `effectiveGain(ch: AudioChannel, programSourceIds: string[]): number` (linear; 0 if muted or follows a source not in program); `dbToGain(db: number): number`
- Produces: `class Mixer { constructor(ctx: AudioContext); sync(audio: ShowState['audio'], programSourceIds: string[], media: SourceRegistry): void; levels(): Record<string, number> /* peak dBFS */; master(): MediaStreamTrack; dispose(): void }` — per channel `source → DelayNode(max 1 s) → GainNode → AnalyserNode → masterGain → DynamicsCompressor(threshold −3, ratio 20, attack 0.003, release 0.1) → GainNode(−1 dB ceiling) → MediaStreamDestination`. Gain changes ramp over 30 ms (no clicks); follows-video changes ramp over the transition duration.

- [ ] **Step 1: Write failing tests:** `audioConstraints('x')` has `deviceId:{exact:'x'}`, `echoCancellation:false`, `noiseSuppression:false`, `autoGainControl:false`, `channelCount:{ideal:2}`, `sampleRate:{ideal:48000}`. `dbToGain(0)===1`, `dbToGain(-6)≈0.501`. `effectiveGain` muted → 0; follows `cam2` while program shows `[cam1]` → 0; program `[cam1,cam2]` (split) → `dbToGain(gainDb)`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** + AudioStrip: one vertical strip per channel (meter, fader −60…+10 dB, mute, delay 0–500 ms, "folgt Bild" select), master meter, "+ Kanal". `AudioContext({ sampleRate: 48000, latencyHint: 'playback' })`; the master track is added to the recorder stream. Video file sources route through `MediaElementSource` (the element itself stays muted towards the speakers; a "Mithören" headphone toggle on master routes to `ctx.destination`). **Step 4: Run** → PASS.
- [ ] **Step 5: Manual check:** clap test against the camera picture; set the delay so it lines up in the recording.
- [ ] **Step 6: Commit** `feat(studio): audio mixer with meters, delay, follow-video and limiter`.

### Task 7: Table tab

**Files:**
- Create: `src/csv.ts`, `src/ui/table/TableTab.tsx`
- Test: `src/__tests__/csv.test.ts`

**Interfaces:**
- Produces: `parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] }` — auto-detects `,` / `;` / tab (German Excel exports use `;`), handles quoted fields with embedded separators, newlines and `""`, strips a UTF-8 BOM, trims header names, skips fully empty rows.

- [ ] **Step 1: Write failing tests:** `'Gruppe;Verein\nSunshine Kids;TSV Röbel'` → columns `['Gruppe','Verein']`, 1 row. Tab-separated paste from Google Sheets works. `'"A, B",C'` stays one field. BOM stripped. Trailing empty lines ignored. Duplicate header `Name,Name` → `['Name','Name 2']`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** + TableTab: spreadsheet grid (click a cell to edit, Enter/Tab to move), add/remove row/column, drag-free row order buttons (↑↓), "CSV einfügen / Datei laden" with a preview before replacing ("Ersetzen" / "Anhängen"), the current row highlighted, "Auf Sendung: Zeile setzen" per row, and the same `n` / "Weiter" control. A cell edit re-renders live overlays immediately. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(studio): Table tab with CSV/Sheets paste import`.

### Task 8: Design tab (form editing)

**Files:**
- Create: `src/ui/design/DesignTab.tsx`
- Test: `src/ui/design/__tests__/template-edit.test.ts`

**Interfaces:**
- Consumes: `updateTemplate` action, `renderFrame`, `STARTER_TEMPLATES`
- Produces: `applyNodeEdit(t: Template, nodeId: string, patch: Partial<TemplateNode>): Template` (pure; clamps `x,y` into 0–1920/0–1080, `size` 8–300, `opacity` 0–1); `duplicateTemplate(t: Template, newId: string): Template` (name + " Kopie")

- [ ] **Step 1: Write failing tests** for the clamps, immutability (the input is unchanged) and `duplicateTemplate`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement:** left = template list (thumbnail rendered with `renderFrame` at 0.15 scale) + "Duplizieren" / "Zurücksetzen"; centre = large preview on a checkerboard with the current table row (or a sample row) and a "Animation abspielen" button; right = node list → fields for text (with a binding hint list from the table's columns), font, weight, size, color, fill, x/y/w/h, image (`/media/` file or URL) and the in/out animation (kind, duration, easing, direction, stagger). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(studio): Design tab — edit template text, colours, images and animations`.

### Task 9: OBS browser-source overlay page

**Files:**
- Create: `overlay.html`, `src/overlay/main.tsx`
- Modify: `electron/overlay-server.cjs` (static `dist/` + `ws` relay on `/state`), `vite.config.ts` (second input), store (push a snapshot to main on every change, throttled 100 ms)
- Test: `electron/__tests__/overlay-server.test.ts`

**Interfaces:**
- Produces: WS message `{ type: 'state'; state: ShowState; rc: Omit<RenderContext,'now'>; sentAt: number }` (latest-wins; the server replays the last snapshot to new clients)
- Produces: server binds **127.0.0.1:7311** only; `/overlay.html` renders `renderFrame(..., { overlaysOnly: true })` on a transparent 1920×1080 canvas with its own rAF loop; it reconnects every 1 s if the studio restarts and keeps the last state on screen meanwhile.

- [ ] **Step 1: Write failing test:** start the server on a random port, connect client A, send a state, connect client B → B receives the same snapshot first; a request for `/media/<unknown-token>` → 404; the server is not reachable on the LAN interface (listen address is `127.0.0.1`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Manual check:** OBS → Browser source `http://127.0.0.1:7311/overlay.html`, 1920×1080 → toggling the lower third in the studio shows it in OBS within ~200 ms, animations included.
- [ ] **Step 6: Commit** `feat(studio): OBS browser-source overlay page driven by the studio state`.

### Task 10: Sponsor break spots from the app's bookings

**Files:**
- Create: `src/sponsors/supporters.ts`, `src/ui/show/SponsorPanel.tsx`
- Modify: `src/render/draw.ts` (RenderContext.sponsor from rotation), `electron/main.cjs` (append air-time log)
- Test: `src/sponsors/__tests__/rotation.test.ts`

**Interfaces:**
- Consumes: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`apps/studio/.env.local`, `.env.example` committed with placeholders); `sponsoring_campaigns` select by `slug` (anon-readable when active) → `rpc('sponsoring_supporters', { p_campaign_id })` → `{ org_account_id, name, avatar_url, package_id, paid_at }[]`
- Produces: `fetchSupporters(slug: string): Promise<Sponsor[]>`, `type Sponsor = { id: string; name: string; logoUrl: string | null; packageId: string }`; `nextSpot(sponsors: Sponsor[], failedIds: Set<string>, lastIndex: number): number` (−1 if none usable); air log `window.studio.fs.appendAirLog({ sponsorId, name, startedAt, endedAt })` → `<recordDir>/werbung-airtime.jsonl`

- [ ] **Step 1: Write failing tests:** rotation skips sponsors without a logo and ids in `failedIds`; wraps around; returns −1 for an empty list or all failed.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement:** SponsorPanel in the Show tab ("Werbung · 7 Partner · neu laden"), "Werbeblock starten" puts the breakSpot overlay on air and rotates every `sponsors.rotationSeconds` (default 8 s) until "Werbeblock beenden"; each spot is logged with start/end. The list is cached in the state so the break works offline. Custom spots ("Werbespot nach Maß", produced by Max) are plain video sources. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(studio): sponsor break spots from DanceCup bookings with air-time log`.

### Task 11: Settings, runbook, rehearsal checklist

**Files:**
- Create: `src/ui/settings/SettingsTab.tsx`, `docs/STUDIO_RUNBOOK.md`, `apps/studio/.env.example`
- Modify: `apps/studio/package.json` (README-style `start` works from a clean clone), root `package.json` (`studio` script)

- [ ] **Step 1: Implement** the Settings tab: target kind (SRT / RTMPS / keiner), URL, key (password field; stored only in local state, never logged), fps 30/50, video kbps 2500–9000, audio kbps, recording folder (folder picker via IPC), ffmpeg path + "Prüfen" (runs `ffmpeg -version` and checks the srt protocol + videotoolbox encoder), campaign slug, "Testbild senden (60 s)".
- [ ] **Step 2: Write `docs/STUDIO_RUNBOOK.md`:** install (nvm, pnpm, brew ffmpeg), start; Cloudflare: create a live input (dashboard → Stream → Live inputs → recording on), copy the SRT URL into Settings, add live outputs for YouTube + Facebook (their RTMP URL + key); OBS fallback: same Cloudflare RTMPS input, the browser source URL, the scene list; and if Cloudflare is down, OBS streams straight to YouTube; rehearsal checklist (venue upload test ≥ 15–20 Mbit/s, capture card + Continuity Camera over the long USB cable, clap test, 60-min soak, network-pull test, minimise test); the go/no-go criteria from spec §2 copied verbatim.
- [ ] **Step 3: Commit** `docs(studio): settings tab + runbook with Cloudflare, OBS fallback and rehearsal checklist`.

### Task 12: Soak test + go/no-go dry run (on the 8 GB M3)

- [ ] **Step 1:** Real setup: 2 camera sources, 1 video file, lower third, clock, logo bug, sponsor rotation, audio from 2 inputs, streaming to the Cloudflare input with its YouTube output (unlisted) + local recording.
- [ ] **Step 2:** Run 60 min. Every 10 min write down from the HealthBar: render fps, encoder speed, overruns, RSS of the renderer + GPU process (Activity Monitor), CPU. Pass: fps ≥ 29.5, speed 0.98–1.02, memory growth < 100 MB over the hour, no audio drift against the picture in the recording at minute 59.
- [ ] **Step 3:** During the run: minimise the window 5 min; pull the network 30 s (expect `VERBINDE NEU` then `ON AIR` again, recording continuous); unplug + replug a camera; quit + relaunch the studio (state restored).
- [ ] **Step 4:** Write the results into the runbook's "Testprotokoll" and commit `docs(studio): soak test results`.
