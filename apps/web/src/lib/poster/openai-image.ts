// Server: render one poster with the OpenAI Images API (gpt-image-2.5).
// References go as multipart bytes to /images/edits; without references we
// call /images/generations. Not imported by client code (no "server-only" so
// the CLI batch script can use it).
import {
  DEFAULT_POSTER_MODEL,
  DEFAULT_POSTER_QUALITY,
  OPENAI_IMAGES_BASE,
  POSTER_RENDER_SIZE,
} from "./constants";
import { estimateCostUsd, type ImageUsage } from "./cost";

export interface RenderPosterInput {
  prompt: string;
  references?: Array<{ bytes: Uint8Array; contentType: string }>;
  size?: string;
  quality?: string;
  model?: string;
}

export interface RenderedPoster {
  bytes: Uint8Array;
  contentType: "image/jpeg";
  usage: ImageUsage | null;
  costUsd: number;
  model: string;
}

export class PosterRenderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "PosterRenderError";
    this.status = status;
  }
}

const TIMEOUT_MS = 170_000;
const RETRY_DELAY_MS = 3_000;

function extensionFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

async function callOnce(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

export async function renderPoster(input: RenderPosterInput): Promise<RenderedPoster> {
  if (typeof window !== "undefined") throw new PosterRenderError("renderPoster is server-only");
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new PosterRenderError("OPENAI_API_KEY fehlt");
  const model = input.model || process.env.POSTER_IMAGE_MODEL || DEFAULT_POSTER_MODEL;
  const size = input.size || POSTER_RENDER_SIZE;
  const quality = input.quality || DEFAULT_POSTER_QUALITY;
  const refs = input.references ?? [];

  const buildRequest = (): { url: string; init: RequestInit } => {
    const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
    if (refs.length > 0) {
      const form = new FormData();
      form.set("model", model);
      form.set("prompt", input.prompt);
      form.set("size", size);
      form.set("quality", quality);
      form.set("output_format", "jpeg");
      form.set("output_compression", "92");
      form.set("n", "1");
      refs.forEach((ref, i) => {
        form.append(
          "image[]",
          new Blob([ref.bytes as BlobPart], { type: ref.contentType }),
          `reference-${i + 1}.${extensionFor(ref.contentType)}`,
        );
      });
      return { url: `${OPENAI_IMAGES_BASE}/edits`, init: { method: "POST", headers, body: form } };
    }
    return {
      url: `${OPENAI_IMAGES_BASE}/generations`,
      init: {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: input.prompt,
          size,
          quality,
          output_format: "jpeg",
          output_compression: 92,
          n: 1,
        }),
      },
    };
  };

  const first = buildRequest();
  let res = await callOnce(first.url, first.init);
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    const second = buildRequest();
    res = await callOnce(second.url, second.init);
  }
  const json = (await res.json().catch(() => null)) as
    | { data?: Array<{ b64_json?: string }>; usage?: ImageUsage; error?: { message?: string } }
    | null;
  if (!res.ok || !json?.data?.[0]?.b64_json) {
    const message = json?.error?.message || `OpenAI Images API ${res.status}`;
    throw new PosterRenderError(message, res.status);
  }
  const bytes = new Uint8Array(Buffer.from(json.data[0].b64_json, "base64"));
  const usage = json.usage ?? null;
  return { bytes, contentType: "image/jpeg", usage, costUsd: estimateCostUsd(usage), model };
}
