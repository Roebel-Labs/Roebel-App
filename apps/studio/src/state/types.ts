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
};
