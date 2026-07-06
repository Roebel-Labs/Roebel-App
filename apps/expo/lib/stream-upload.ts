import * as tus from 'tus-js-client';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

/**
 * Direct-to-Cloudflare-Stream video upload (tus) via the video-upload-url
 * edge function. The file streams from disk in chunks — it is never read
 * into memory as base64 (unlike upload-media.ts).
 */

// Cloudflare requires tus chunk sizes divisible by 256 KiB, minimum 5 MiB.
export const STREAM_CHUNK_SIZE = 8 * 1024 * 1024; // 32 × 256 KiB

const PROBE_TTL_MS = 5 * 60 * 1000;
let probeCache: { configured: boolean; at: number } | null = null;

/** Is Cloudflare Stream configured server-side? Cached for 5 minutes. */
export async function probeStreamConfigured(): Promise<boolean> {
  if (probeCache && Date.now() - probeCache.at < PROBE_TTL_MS) {
    return probeCache.configured;
  }
  let configured = false;
  try {
    const { data, error } = await supabase.functions.invoke('video-upload-url', {
      body: { action: 'probe' },
    });
    configured = !error && data?.configured === true;
  } catch {
    configured = false;
  }
  probeCache = { configured, at: Date.now() };
  return configured;
}

export function _resetProbeCacheForTests() {
  probeCache = null;
}

/** Poll the edge function until Cloudflare reports the video is playable. */
async function waitUntilReady(uid: string, timeoutMs = 360_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { data } = await supabase.functions.invoke('video-upload-url', {
        body: { action: 'status', uid },
      });
      if (data?.readyToStream === true) return true;
      if (data?.state === 'error') return false;
    } catch {
      // transient — keep polling until the deadline
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

/**
 * Upload a local video to Cloudflare Stream.
 * Returns the HLS playback URL once ready to stream, or null on failure.
 * onProgress receives 0..1 (upload only; polling shows as 1).
 */
export async function uploadVideoToStream(
  uri: string,
  walletAddress: string,
  onProgress?: (fraction: number) => void,
): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    if (!info.exists || !info.size) {
      console.error('[stream-upload] file missing or empty:', uri);
      return null;
    }

    const { data, error } = await supabase.functions.invoke('video-upload-url', {
      body: { action: 'create', wallet: walletAddress, uploadLength: info.size },
    });
    if (error || !data?.uploadUrl || !data?.uid || !data?.playbackUrl) {
      console.error('[stream-upload] create failed:', error ?? data);
      return null;
    }

    await new Promise<void>((resolve, reject) => {
      // tus-js-client's React Native mode takes a { uri } file reference and
      // streams it from disk; the types only model File/Blob, hence the cast.
      const upload = new tus.Upload({ uri } as unknown as Blob, {
        uploadUrl: data.uploadUrl,
        chunkSize: STREAM_CHUNK_SIZE,
        uploadSize: info.size,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        onError: reject,
        onProgress: (sent, total) => {
          if (onProgress && total > 0) onProgress(sent / total);
        },
        onSuccess: () => resolve(),
      });
      upload.start();
    });

    const ready = await waitUntilReady(data.uid);
    if (!ready) {
      console.error('[stream-upload] video never became ready:', data.uid);
      return null;
    }
    return data.playbackUrl as string;
  } catch (err) {
    console.error('[stream-upload] upload failed:', err);
    return null;
  }
}
