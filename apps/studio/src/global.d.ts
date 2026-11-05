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
        getStatus(): Promise<{ started: boolean; startedAt: number | null; videoKbps: number | null; status: OutputStatus }>;
      };
      media: {
        /** Grants the renderer access to a local file; resolves to http://127.0.0.1:7311/media/<token>. */
        allow(absPath: string): Promise<string>;
      };
      overlay: {
        /** Listen state of the local media/overlay server (127.0.0.1). */
        status(): Promise<{ ok: boolean; port: number | null; error: string | null }>;
      };
      dialog: {
        pickFile(kind: 'video' | 'image'): Promise<string | null>;
        pickFolder(): Promise<string | null>;
      };
      sys: {
        usage(): Promise<{ cpu: number; memMb: number; mainCpu: number }>;
      };
      app: {
        onWillQuit(cb: () => void): () => void;
        quitReady(): void;
        onConfirmQuit(cb: () => void): () => void;
        confirmQuit(): void;
      };
    };
  }
}

export {};
