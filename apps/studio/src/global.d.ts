import type { OutputConfig, OutputStatus, StreamTarget } from './state/types';

declare global {
  interface Window {
    studio: {
      output: {
        start(cfg: OutputConfig): Promise<void>;
        chunk(buf: ArrayBuffer): void;
        stop(): Promise<void>;
        /** Restarts the encoder so failed destinations reconnect (short gap on all of them); `cfg` replaces the destination set. */
        reconnect(cfg?: Pick<OutputConfig, 'destinations'>): Promise<void>;
        /** 20 s test pattern to this destination only. */
        test(req: {
          destination: StreamTarget;
          fps: 30 | 50;
          videoKbps: number;
          audioKbps: number;
          ffmpegPath: string;
        }): Promise<{ ok: boolean; error?: string }>;
        onStatus(cb: (s: OutputStatus) => void): () => void;
        onNeedHeader(cb: () => void): () => void;
        getStatus(): Promise<{ started: boolean; startedAt: number | null; videoKbps: number | null; status: OutputStatus }>;
      };
      media: {
        /** Grants the renderer access to a local file; resolves to http://127.0.0.1:7311/media/<token>. */
        allow(absPath: string): Promise<string>;
      };
      fs: {
        /** Appends one spot to <recordDir>/werbung-airtime.jsonl; never rejects. */
        appendAirLog(entry: {
          recordDir: string;
          sponsorId: string;
          name: string;
          startedAt: string;
          endedAt: string;
        }): Promise<{ ok: boolean; error?: string }>;
      };
      overlay: {
        /** Listen state of the local media/overlay server (127.0.0.1). */
        status(): Promise<{ ok: boolean; port: number | null; error: string | null }>;
      };
      dialog: {
        pickFile(kind: 'video' | 'image'): Promise<string | null>;
        pickFolder(): Promise<string | null>;
      };
      ffmpeg: {
        check(ffmpegPath: string): Promise<{ ok: boolean; version: string | null; srt: boolean; encoder: string | null; softwareEncoder: boolean; path?: string; source?: 'configured' | 'bundled'; error?: string }>;
      };
      sys: {
        usage(): Promise<{ cpu: number; memMb: number; mainCpu: number }>;
      };
      shell: {
        /** Opens an http(s) URL in the system browser (main validates the scheme). */
        openExternal(url: string): Promise<boolean>;
      };
      app: {
        onWillQuit(cb: () => void): () => void;
        quitReady(): void;
        onConfirmQuit(cb: () => void): () => void;
        confirmShown(): void;
        confirmQuit(): void;
      };
    };
  }
}

export {};
