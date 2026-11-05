export type OutputTarget =
  | { kind: 'srt'; url: string }
  | { kind: 'rtmp'; url: string; key: string }
  | { kind: 'none' };

export type OutputConfig = {
  target: OutputTarget;
  fps: 30 | 50;
  videoKbps: number;
  audioKbps: number;
  recordDir: string;
  ffmpegPath: string;
};

export type OutputStatus = {
  state: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error';
  since: number;
  fps?: number;
  kbps?: number;
  speed?: number;
  recordingFile?: string;
  recordingBytes: number;
  restarts: number;
  lastError?: string;
  /** Sticky until the next start: the local recording hit a write error. */
  recordingError?: string;
};

// ---- Show state (Task 2) ----

export type Easing = 'linear' | 'easeInOut' | 'easeOut' | 'backOut';

export type Source = {
  id: string;
  kind: 'camera' | 'video' | 'image' | 'color';
  label: string;
  deviceId?: string;
  url?: string;
  color?: string;
  loop?: boolean;
  audioChannelId?: string;
};

export type Scene = {
  id: string;
  label: string;
  layout: 'full' | 'pip' | 'split';
  sourceIds: string[];
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
  weight?: 400 | 600 | 700 | 800;
  size?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  src?: string;
  fit?: 'contain' | 'cover';
  delayMs?: number;
};

export type Template = {
  id: string;
  name: string;
  kind: 'lowerThird' | 'logoBug' | 'clock' | 'nextUp' | 'breakSpot' | 'pause' | 'donation' | 'custom';
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
  donation: { name: string; amount: string; message: string } | null;
};

export type OverlayInstance = {
  id: string;
  templateId: string;
  visible: boolean;
  changedAt: number;
};

export type TableRow = { id: string; values: Record<string, string> };

export type Table = {
  columns: string[];
  rows: TableRow[];
  currentRowId: string | null;
};

export type Settings = {
  target: OutputTarget;
  fps: 30 | 50;
  videoKbps: number;
  audioKbps: number;
  recordDir: string;
  ffmpegPath: string;
};

export type SponsorItem = { id: string; name: string; logoUrl: string | null };

export type ShowState = {
  version: 1;
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
  sponsors: { rotationSeconds: number; items: SponsorItem[] };
};
