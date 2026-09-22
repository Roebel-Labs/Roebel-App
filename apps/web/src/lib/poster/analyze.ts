// Server: fetch the event image through the SSRF guard and read its pixel size.
import { imageSize } from "image-size";
import { MAX_REFERENCE_BYTES } from "./constants";
import { isAllowedReferenceUrl } from "./reference-guard";

export interface FetchedImage {
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
}

const FETCH_TIMEOUT_MS = 20_000;

/** null when the URL is not ours, unreachable, not an image, too large or unreadable. */
export async function fetchSourceImage(url: string | null | undefined): Promise<FetchedImage | null> {
  const trimmed = url?.trim();
  if (!trimmed || !isAllowedReferenceUrl(trimmed, process.env.NEXT_PUBLIC_SUPABASE_URL)) return null;
  try {
    const res = await fetch(trimmed, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_REFERENCE_BYTES) return null;
    const dims = imageSize(buf);
    if (!dims.width || !dims.height) return null;
    return { bytes: buf, contentType, width: dims.width, height: dims.height };
  } catch (error) {
    console.warn("fetchSourceImage failed", error);
    return null;
  }
}
