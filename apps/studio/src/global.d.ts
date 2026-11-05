import type { OutputConfig, OutputStatus } from './state/types';

declare global {
  interface Window {
    studio: {
      output: {
        start(cfg: OutputConfig): Promise<void>;
        chunk(buf: ArrayBuffer): void;
        stop(): Promise<void>;
        onStatus(cb: (s: OutputStatus) => void): () => void;
        onNeedHeader(cb: () => void): () => void;
      };
      media: {
        /** Grants the renderer access to a local file; resolves to http://127.0.0.1:7311/media/<token>. */
        allow(absPath: string): Promise<string>;
      };
      /** TEMPORARY (Task 1 spike): dev-only env passthrough. */
      spike: {
        autostart: string | null;
        rtmp: { url: string; key: string } | null;
        ffmpegPath: string | null;
        recordDir: string | null;
        camera: boolean;
        fps: 30 | 50;
        simulateLossMs: number;
      };
    };
  }
}

export {};
