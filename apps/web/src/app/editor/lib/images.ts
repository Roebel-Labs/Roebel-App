// Client-side image preparation for chat attachments: downscale to a
// vision-friendly size (the brief model doesn't need more than ~1280px) and
// build a small thumbnail for the chat bubble / localStorage session.

export interface PreparedImage {
  /** Downscaled JPEG data URL sent to the generate API (≤1280px, q0.85). */
  dataUrl: string;
  /** Tiny thumb for chat display + session persistence (≤160px). */
  thumb: string;
  name: string;
}

const MAX_DIM = 1280;
const THUMB_DIM = 160;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export function isAcceptedImage(file: File): boolean {
  return ACCEPTED.includes(file.type);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file);
  try {
    const dataUrl = drawScaled(bitmap, MAX_DIM, 0.85);
    const thumb = drawScaled(bitmap, THUMB_DIM, 0.7);
    return { dataUrl, thumb, name: file.name };
  } finally {
    if ("close" in bitmap) (bitmap as ImageBitmap).close();
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> decoding (e.g. odd webp) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawScaled(source: ImageBitmap | HTMLImageElement, maxDim: number, quality: number): string {
  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  // White backdrop: transparent PNGs would otherwise turn black as JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
