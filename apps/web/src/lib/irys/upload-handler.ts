// POST /api/irys/upload handler. The server wallet (IRYS_UPLOAD_PRIVATE_KEY) pays for every
// upload, so since 2026-09-27 the route requires:
//  - a wallet signature over the exact content + tags (upload-message.ts), verified EOA →
//    ERC-1271/6492 on Gnosis, fresh within MAX_SIGNED_AGE_SECONDS;
//  - `userAddress` == the signing wallet (the "Uploader" tag can no longer be spoofed);
//  - per-wallet rate limits and a size cap.
// Request/response otherwise unchanged: `{ content, tags, userAddress }` in,
// `{ success, id, url, receipt }` out; the new `auth: { timestampSec, signature }` field carries
// the proof.
//
// No next/* imports and relative imports only, so `npx tsx --test` can load it.
import { takeAll, type RateLimiter } from "../rate-limit/index";
import { MAX_SIGNED_AGE_SECONDS } from "../signed-request/message";
import { buildIrysUploadMessage, type IrysTag } from "./upload-message";

export const MAX_CONTENT_BYTES = 1_000_000;
export const MAX_TAGS = 20;
export const MAX_TAG_LEN = 256;
/** Tags the server sets itself; a client value would be overwritten, so it is refused. */
const RESERVED_TAGS = new Set(["uploader", "timestamp", "app-version"]);

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
const SIG_RE = /^0x[a-fA-F0-9]{130,}$/;

export interface IrysReceipt {
  id: string;
  timestamp?: number;
  version?: string;
}

export interface IrysUploadDeps {
  verifySignature(wallet: string, message: string, signature: string): Promise<boolean>;
  limiters: RateLimiter[];
  /** Performs the upload with the server wallet. */
  upload(content: string, tags: IrysTag[]): Promise<IrysReceipt>;
  hasKey: boolean;
  nowMs?: () => number;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function parseTags(raw: unknown): IrysTag[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_TAGS) return null;
  const tags: IrysTag[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") return null;
    const { name, value } = t as Record<string, unknown>;
    if (typeof name !== "string" || typeof value !== "string") return null;
    if (!name || name.length > MAX_TAG_LEN || value.length > MAX_TAG_LEN) return null;
    if (RESERVED_TAGS.has(name.toLowerCase())) return null;
    tags.push({ name, value });
  }
  return tags;
}

export async function handleIrysUpload(request: Request, deps: IrysUploadDeps): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json(400, { error: "Invalid JSON body" });
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const { content, userAddress } = body;
  if (!content || typeof content !== "string") return json(400, { error: "Content is required and must be a string" });
  if (typeof userAddress !== "string" || !WALLET_RE.test(userAddress)) return json(400, { error: "User address is required" });
  if (new TextEncoder().encode(content).length > MAX_CONTENT_BYTES) return json(413, { error: "Content too large" });
  const rawTags = body.tags;
  const tags = parseTags(rawTags);
  if (!tags) return json(400, { error: "Invalid tags" });

  const auth = (body.auth ?? {}) as Record<string, unknown>;
  const ts = Number(auth.timestampSec);
  const signature = auth.signature;
  if (typeof signature !== "string" || !SIG_RE.test(signature) || !Number.isFinite(ts)) {
    return json(401, { error: "Signature required" });
  }
  const nowSec = (deps.nowMs ?? Date.now)() / 1000;
  if (Math.abs(nowSec - ts) > MAX_SIGNED_AGE_SECONDS) return json(401, { error: "Signature expired" });

  const wallet = userAddress.toLowerCase();
  // The signature covers the tags exactly as the client sent them (undefined → []).
  const message = buildIrysUploadMessage(wallet, ts, content, (rawTags as IrysTag[] | undefined) ?? []);
  let verified = false;
  try {
    verified = await deps.verifySignature(wallet, message, signature);
  } catch (err) {
    console.error("[api/irys/upload] verifier unreachable", err instanceof Error ? err.message : err);
    return json(503, { error: "Could not verify the signature right now" });
  }
  if (!verified) return json(401, { error: "Signature does not match userAddress" });

  if (!(await takeAll(deps.limiters, wallet))) return json(429, { error: "Too many uploads. Please try again later." });

  if (!deps.hasKey) {
    console.error("[api/irys/upload] IRYS_UPLOAD_PRIVATE_KEY not configured");
    return json(500, { error: "Server configuration error: Upload key not set" });
  }

  const uploadTags: IrysTag[] = [
    ...tags,
    { name: "Uploader", value: userAddress },
    { name: "Timestamp", value: Date.now().toString() },
    { name: "App-Version", value: "1.0.0" },
  ];
  try {
    const receipt = await deps.upload(content, uploadTags);
    return json(200, {
      success: true,
      id: receipt.id,
      url: `https://gateway.irys.xyz/${receipt.id}`,
      receipt: { id: receipt.id, timestamp: receipt.timestamp, version: receipt.version },
    });
  } catch (error) {
    console.error("[api/irys/upload] upload failed", error instanceof Error ? error.message : error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return json(500, { error: errorMessage, details: errorMessage });
  }
}

export const IRYS_UPLOAD_RATE_RULES = [
  { name: "irys-upload-hour", limit: 20, windowMs: 3_600_000 },
  { name: "irys-upload-day", limit: 60, windowMs: 86_400_000 },
];
