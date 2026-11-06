export type OutputTarget =
  | { kind: 'srt'; url: string }
  | { kind: 'rtmp'; url: string; key: string }
  | { kind: 'none' };

/** A target ffmpeg can actually push to. */
export type StreamTarget = Exclude<OutputTarget, { kind: 'none' }>;

/** One configured stream destination (Cloudflare, YouTube, Facebook, …). Keys live only in localStorage. */
export type Destination = { id: string; name: string; enabled: boolean; target: OutputTarget };

export type OutputConfig = {
  /** Enabled, usable destinations only (resolved in the renderer). Empty = record-only ("Nur aufnehmen"). */
  destinations: Array<StreamTarget & { id: string }>;
  fps: 30 | 50;
  videoKbps: number;
  audioKbps: number;
  /** false = no local .mkv (long shows, small disk); the stream is unaffected. */
  record: boolean;
  recordDir: string;
  ffmpegPath: string;
};

export type DestinationStatus = { id: string; state: 'ok' | 'failed'; lastError?: string };

export type OutputStatus = {
  state: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error';
  since: number;
  fps?: number;
  kbps?: number;
  speed?: number;
  /** Frames ffmpeg dropped (cumulative, from its progress line). */
  dropped?: number;
  recordingFile?: string;
  recordingBytes: number;
  restarts: number;
  lastError?: string;
  /** Set while the local recording is broken ("Aufnahme unterbrochen"); cleared once a write into a new file succeeds. */
  recordingError?: string;
  /** "Lokal aufnehmen" is off for this session. */
  recordingOff?: boolean;
  /** No destination: the session only records locally (no ffmpeg). */
  recordOnly?: boolean;
  /** Last time ffmpeg reported "FIFO queue full": a destination cannot keep up and drops packets. */
  slowDestinationAt?: number;
  /** Per destination, in config order. A failed tee slave stays failed until "Ziel neu verbinden". */
  destinations?: DestinationStatus[];
};

// ---- Show state (Task 2) ----

export type Easing = 'linear' | 'easeInOut' | 'easeOut' | 'backOut';

export type Source = {
  id: string;
  /** 'external': a MediaStream handed in at runtime (Live-Raum phone guest). The stream itself is held in
   * media/external.ts, never here; external sources do not survive a restart. */
  kind: 'camera' | 'video' | 'image' | 'color' | 'external';
  label: string;
  deviceId?: string;
  url?: string;
  color?: string;
  loop?: boolean;
  audioChannelId?: string;
  /** External source whose stream went away while its scene was on air: kept (as "Signal verloren") until the operator cuts away. */
  detached?: boolean;
};

export type Scene = {
  id: string;
  label: string;
  layout: 'full' | 'pip' | 'split';
  sourceIds: string[];
  /** Split only: both halves fill the frame height (cropped) instead of two 16:9 halves with bars. */
  fill?: boolean;
  /** Split / picture-in-picture: source drawn full-frame behind the layout instead of black. */
  backgroundSourceId?: string;
};

export type TransitionKind = 'cut' | 'fade' | 'wipe' | 'slide' | 'zoom';

export type TransitionPreset = {
  id: string;
  name: string;
  kind: TransitionKind;
  durationMs: number;
  easing: Easing;
  direction?: 'left' | 'right' | 'up' | 'down';
};

export type OverlayAnim = {
  kind: 'none' | 'fade' | 'slide' | 'scale' | 'wipe';
  durationMs: number;
  easing: Easing;
  from?: 'left' | 'right' | 'top' | 'bottom';
  staggerMs?: number;
  /** 'scale' only: start size (default 0.9). */
  scaleFrom?: number;
};

export type TemplateNode = {
  id: string;
  type: 'rect' | 'text' | 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  radius?: number;
  opacity?: number;
  text?: string;
  font?: 'Inter' | 'Plus Jakarta Sans';
  weight?: 400 | 600 | 700 | 800 | 900;
  italic?: boolean;
  uppercase?: boolean;
  /** Letter spacing in px (negative = tighter). */
  tracking?: number;
  size?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  src?: string;
  fit?: 'contain' | 'cover';
  delayMs?: number;
  /** Outline (rect: around the shape; text: unused). */
  stroke?: string;
  strokeWidth?: number;
  shadow?: { x: number; y: number; blur: number; color: string };
  /** Per-corner radii [top-left, top-right, bottom-right, bottom-left]; wins over `radius`. */
  radii?: [number, number, number, number];
  /** Rect: the bottom-right corner sits this many px left of the top-right one (slanted right edge). */
  slant?: number;
  /** Hug: this node's right edge = the measured right edge of node `hug` + `hugPad`. */
  hug?: string;
  hugPad?: number;
  /** Flow: this node's x = the (hugged) right edge of node `after` + `afterGap`. */
  after?: string;
  afterGap?: number;
  /** The node's own entrance (default: the template's animIn); the exit stays the template's animOut. */
  animIn?: OverlayAnim;
};

export type Template = {
  id: string;
  name: string;
  kind: 'lowerThird' | 'logoBug' | 'clock' | 'nextUp' | 'breakSpot' | 'pause' | 'chatHighlight' | 'custom';
  fullScreen: boolean;
  nodes: TemplateNode[];
  animIn: OverlayAnim;
  animOut: OverlayAnim;
};

export type RenderContext = {
  row: Record<string, string> | null;
  next: Record<string, string> | null;
  now: Date;
  sponsor: { name: string; logoUrl: string } | null;
  /** The chat message the Live-Raum puts on air ({{chat.name}}, {{chat.body}}, {{chat.avatar}}). */
  chatHighlight: { name: string; body: string; avatarUrl: string } | null;
};

export type OverlayInstance = {
  id: string;
  templateId: string;
  visible: boolean;
  changedAt: number;
  /** Overlay progress (0…1) at `changedAt`; the new animation continues from here instead of popping. */
  fromProgress?: number;
};

export type TableRow = { id: string; values: Record<string, string> };

export type Table = {
  columns: string[];
  rows: TableRow[];
  currentRowId: string | null;
};

export type Settings = {
  destinations: Destination[];
  fps: 30 | 50;
  videoKbps: number;
  audioKbps: number;
  /** Lokal aufnehmen (default on). */
  record: boolean;
  recordDir: string;
  ffmpegPath: string;
};

export type SponsorItem = { id: string; name: string; logoUrl: string | null };

export type AudioChannel = {
  id: string;
  label: string;
  input: { kind: 'device'; deviceId: string } | { kind: 'source'; sourceId: string } | { kind: 'external'; sourceId: string };
  gainDb: number;
  muted: boolean;
  delayMs: number;
  /** Channel is audible only while this source is part of the program picture. */
  followsVideoSourceId?: string;
};

export type ShowState = {
  version: 1;
  /** Which starter set this state has seen; restore() adds starters introduced later exactly once. */
  starterVersion: number;
  sources: Source[];
  scenes: Scene[];
  previewSceneId: string | null;
  programSceneId: string | null;
  transition: { presetId: string; startedAt: number | null; fromSceneId: string | null };
  presets: TransitionPreset[];
  overlays: OverlayInstance[];
  templates: Template[];
  table: Table;
  settings: Settings;
  sponsors: {
    rotationSeconds: number;
    items: SponsorItem[];
    /** A Werbeblock is running; the spot on air is `currentId`. Lives in the state so the OBS overlay page sees it too. */
    breakActive: boolean;
    currentId: string | null;
  };
  audio: { channels: AudioChannel[]; masterDb: number };
};

// ---- Renderer (Task 3) ----

/** Resolves a source id to a drawable element and its health. */
export type MediaLookup = (sourceId: string) => { el: CanvasImageSource | null; status: 'ok' | 'loading' | 'lost' };
