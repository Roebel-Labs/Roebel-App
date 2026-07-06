import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

/**
 * Direct-to-Cloudflare-Stream video upload (tus) via the video-upload-url
 * edge function. Falls back to Supabase Storage in the composer when the
 * edge function reports Stream is not configured.
 */

// Cloudflare requires tus chunk sizes divisible by 256 KiB, minimum 5 MiB.
const STREAM_CHUNK_SIZE = 8 * 1024 * 1024; // 32 × 256 KiB
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];
const PROBE_TTL_MS = 5 * 60 * 1000;

// Must match MAX_DURATION_SECONDS in the video-upload-url edge function.
// Cloudflare only validates duration AFTER the full upload, so callers should
// reject over-long files client-side before uploading gigabytes for nothing.
export const MAX_VIDEO_DURATION_SECONDS = 900; // 15 min

let probeCache: { configured: boolean; at: number } | null = null;

/** Read a video File's duration in seconds from its metadata. */
export function getVideoFileDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("could not read video metadata"));
    };
    video.src = objectUrl;
  });
}

/** Is Cloudflare Stream configured server-side? Cached for 5 minutes. */
export async function probeStreamConfigured(): Promise<boolean> {
  if (probeCache && Date.now() - probeCache.at < PROBE_TTL_MS) {
    return probeCache.configured;
  }
  let configured = false;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("video-upload-url", {
      body: { action: "probe" },
    });
    configured = !error && data?.configured === true;
  } catch {
    configured = false;
  }
  probeCache = { configured, at: Date.now() };
  return configured;
}

/** Poll the edge function until Cloudflare reports the video is playable. */
async function waitUntilReady(uid: string, timeoutMs = 360_000): Promise<boolean> {
  const supabase = createClient();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { data } = await supabase.functions.invoke("video-upload-url", {
        body: { action: "status", uid },
      });
      if (data?.readyToStream === true) return true;
      if (data?.state === "error") return false;
    } catch {
      // transient — keep polling until the deadline
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

/**
 * Upload a video File to Cloudflare Stream.
 * Returns the HLS playback URL once ready to stream, or null on failure.
 * onProgress receives 0..100 (upload only; polling shows as 100).
 */
export async function uploadVideoToStream(
  file: File,
  walletAddress: string,
  onProgress?: (pct: number) => void,
): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("video-upload-url", {
      body: { action: "create", wallet: walletAddress, uploadLength: file.size },
    });
    if (error || !data?.uploadUrl || !data?.uid || !data?.playbackUrl) {
      console.error("[stream-upload] create failed:", error ?? data);
      return null;
    }

    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        uploadUrl: data.uploadUrl,
        chunkSize: STREAM_CHUNK_SIZE,
        retryDelays: RETRY_DELAYS,
        onError: reject,
        onProgress: (sent, total) => {
          if (onProgress && total > 0) onProgress(Math.round((sent / total) * 100));
        },
        onSuccess: () => resolve(),
      });
      upload.start();
    });

    const ready = await waitUntilReady(data.uid);
    if (!ready) {
      console.error("[stream-upload] video never became ready:", data.uid);
      return null;
    }
    return data.playbackUrl as string;
  } catch (err) {
    console.error("[stream-upload] upload failed:", err);
    return null;
  }
}
