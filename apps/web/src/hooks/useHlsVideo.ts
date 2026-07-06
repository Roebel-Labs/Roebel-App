"use client";

import { useEffect, type RefObject } from "react";

/** True for HLS manifest URLs (Cloudflare Stream playback). */
export function isHlsUrl(url: string): boolean {
  return url.split("?")[0].endsWith(".m3u8");
}

/** Cloudflare Stream auto-thumbnail for an HLS manifest URL, else null. */
export function hlsPosterUrl(url: string): string | null {
  if (!isHlsUrl(url) || !url.includes(".cloudflarestream.com/")) return null;
  return url.replace(/\/manifest\/video\.m3u8.*$/, "/thumbnails/thumbnail.jpg");
}

/**
 * Attach an HLS source to a <video>. Safari plays HLS natively (we just set
 * src); other browsers lazily load hls.js. No-op for non-HLS URLs — the
 * component keeps rendering plain MP4s via the src attribute as before.
 */
export function useHlsVideo(videoRef: RefObject<HTMLVideoElement | null>, url: string) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isHlsUrl(url)) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      return;
    }

    let cancelled = false;
    let hls: import("hls.js").default | null = null;
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported() || !videoRef.current) return;
      hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(videoRef.current);
    });

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [videoRef, url]);
}
