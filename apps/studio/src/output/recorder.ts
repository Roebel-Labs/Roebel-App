// Encodes the program MediaStream with MediaRecorder and ships each chunk to
// Electron main (window.studio.output.chunk), which records + feeds ffmpeg.

const PRIMARY_MIME = 'video/x-matroska;codecs=avc1,opus';
const FALLBACK_MIME = 'video/webm;codecs=h264,opus';

export function pickRecorderMime(): string {
  if (MediaRecorder.isTypeSupported(PRIMARY_MIME)) return PRIMARY_MIME;
  if (MediaRecorder.isTypeSupported(FALLBACK_MIME)) return FALLBACK_MIME;
  throw new Error('recorder_mime_unsupported');
}

export function startRecorder(
  stream: MediaStream,
  opts: { videoKbps: number; onError?: (message: string) => void },
): { stop(): Promise<void>; mimeType: string } {
  const mimeType = pickRecorderMime();
  const rec = new MediaRecorder(stream, {
    mimeType,
    // Intermediate quality is high; ffmpeg does the real bitrate shaping.
    videoBitsPerSecond: opts.videoKbps * 2 * 1000,
    audioBitsPerSecond: 192000,
  });

  // blob.arrayBuffer() is async: chain sends so chunk order is preserved.
  let chain: Promise<void> = Promise.resolve();
  rec.ondataavailable = (ev: BlobEvent) => {
    if (!ev.data || ev.data.size === 0) return;
    const blob = ev.data;
    chain = chain.then(async () => {
      window.studio.output.chunk(await blob.arrayBuffer());
    });
  };

  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });

  rec.onerror = (ev: Event) => {
    const err = (ev as Event & { error?: DOMException }).error;
    opts.onError?.(err?.message || err?.name || 'MediaRecorder-Fehler');
  };

  rec.start(250);

  return {
    mimeType,
    async stop() {
      if (rec.state !== 'inactive') rec.stop();
      await stopped;
      await chain;
    },
  };
}
