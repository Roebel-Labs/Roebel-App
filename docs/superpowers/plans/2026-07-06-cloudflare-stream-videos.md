# Cloudflare Stream Post Videos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Post videos up to 10 minutes upload via tus directly to Cloudflare Stream and play back as adaptive HLS through the existing native players in both apps, with silent fallback to today's Supabase path until Cloudflare secrets are set.

**Architecture:** One anon-invocable Supabase Edge Function (`video-upload-url`) mints one-time Cloudflare tus upload URLs (secrets live only in Supabase). Both apps probe it, tus-upload directly to Cloudflare, poll until `readyToStream`, and store the HLS manifest URL in the existing `posts.video_url` column (zero schema changes). Expo's expo-video plays HLS natively; web gets a lazy hls.js attach for non-Safari browsers.

**Tech Stack:** Supabase Edge Functions (Deno), Cloudflare Stream direct creator uploads (tus), `tus-js-client` (already in web, add to expo), `hls.js` (add to web), jest-expo.

**Spec:** `docs/superpowers/specs/2026-07-06-cloudflare-stream-videos-design.md`

## Global Constraints

- All UI copy in German (e.g. "Wird hochgeladen…", "Video wird verarbeitet…").
- pnpm only; install app-local deps with `cd apps/<app> && pnpm add <pkg>`.
- Expo styling: `StyleSheet.create()` + `useTheme()` — NO NativeWind.
- Commit convention: `feat(expo): …` / `feat(web): …`; commit + push after every task; stage only files you changed (never `git add .`).
- Cloudflare tus chunk size MUST be divisible by 256 KiB (262,144 B) and ≥ 5 MiB — use exactly `8 * 1024 * 1024`.
- Server-side caps in the edge function: `maxDurationSeconds = 600`, upload length ≤ 2 GiB.
- Edge function secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, `CLOUDFLARE_STREAM_CUSTOMER_CODE`. Missing secrets must NEVER crash — `probe` → `{ configured:false }`, other actions → 503 `{ error:"stream_not_configured" }`.
- Never show wallet addresses in UI.
- Do NOT run `eas update` or deploy the edge function (Supabase MCP unauthenticated here) — deployment is the user's ops gate.
- Expo repo has ~431 pre-existing tsc errors; do not run repo-wide `tsc` as a gate. Verify with scoped eslint + jest.

---

### Task 1: Edge Function `video-upload-url`

**Files:**
- Create: `apps/expo/supabase/functions/video-upload-url/index.ts`

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces (JSON API used by Tasks 2 and 4):
  - `{ action:'probe' }` → `200 { configured: boolean }`
  - `{ action:'create', wallet: string, uploadLength: number }` → `200 { uploadUrl, uid, playbackUrl, thumbnailUrl }` | `503 { error:'stream_not_configured' }` | `400 { error:'invalid_upload_length' }` | `502 { error:'cloudflare_create_failed' }`
  - `{ action:'status', uid: string }` → `200 { readyToStream: boolean, state: string|null }` | `503`/`400`/`502` as above

- [ ] **Step 1: Write the edge function**

```ts
// Edge Function: video-upload-url
// Mints Cloudflare Stream direct-creator-upload (tus) URLs so clients upload
// videos straight to Cloudflare — the file never touches Supabase. The
// resulting HLS manifest URL is what clients store in posts.video_url.
//
// Actions:
//   probe : { action:'probe' }                          → { configured }
//   create: { action:'create', wallet, uploadLength }   → { uploadUrl, uid, playbackUrl, thumbnailUrl }
//   status: { action:'status', uid }                    → { readyToStream, state }
//
// Required secrets: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN,
//                   CLOUDFLARE_STREAM_CUSTOMER_CODE (playback subdomain,
//                   with or without the "customer-" prefix).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_DURATION_SECONDS = 600; // hard server-side cap (10 min)
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB safety cap

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function config() {
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN");
  const rawCode = Deno.env.get("CLOUDFLARE_STREAM_CUSTOMER_CODE");
  if (!accountId || !apiToken || !rawCode) return null;
  return { accountId, apiToken, customerCode: rawCode.replace(/^customer-/, "") };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const cfg = config();

    if (action === "probe") return json({ configured: cfg !== null });
    if (!cfg) return json({ error: "stream_not_configured" }, 503);

    if (action === "create") {
      const uploadLength = Number(body?.uploadLength);
      if (!Number.isFinite(uploadLength) || uploadLength <= 0 || uploadLength > MAX_UPLOAD_BYTES) {
        return json({ error: "invalid_upload_length" }, 400);
      }
      const creator = typeof body?.wallet === "string" ? body.wallet.slice(0, 64) : "";
      const meta = [
        `maxdurationseconds ${btoa(String(MAX_DURATION_SECONDS))}`,
        creator ? `creator ${btoa(creator)}` : "",
      ].filter(Boolean).join(",");

      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/stream?direct_user=true`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.apiToken}`,
            "Tus-Resumable": "1.0.0",
            "Upload-Length": String(uploadLength),
            "Upload-Metadata": meta,
          },
        },
      );
      const uploadUrl = res.headers.get("location");
      const uid = res.headers.get("stream-media-id");
      if (!res.ok || !uploadUrl || !uid) {
        console.error("[video-upload-url] create failed:", res.status, await res.text());
        return json({ error: "cloudflare_create_failed" }, 502);
      }
      const base = `https://customer-${cfg.customerCode}.cloudflarestream.com/${uid}`;
      return json({
        uploadUrl,
        uid,
        playbackUrl: `${base}/manifest/video.m3u8`,
        thumbnailUrl: `${base}/thumbnails/thumbnail.jpg`,
      });
    }

    if (action === "status") {
      const uid = typeof body?.uid === "string" ? body.uid : "";
      if (!/^[a-f0-9]{16,64}$/i.test(uid)) return json({ error: "invalid_uid" }, 400);
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/stream/${uid}`,
        { headers: { Authorization: `Bearer ${cfg.apiToken}` } },
      );
      if (!res.ok) return json({ error: "cloudflare_status_failed" }, 502);
      const data = await res.json();
      return json({
        readyToStream: data?.result?.readyToStream === true,
        state: data?.result?.status?.state ?? null,
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("[video-upload-url] error:", err);
    return json({ error: "internal_error" }, 500);
  }
});
```

- [ ] **Step 2: Verify syntax (best effort)**

Run: `command -v deno >/dev/null && deno check apps/expo/supabase/functions/video-upload-url/index.ts || echo "deno not installed — verified at deploy time"`
Expected: `Check …/index.ts` with no errors, or the skip message. (Deployment itself is the user's ops gate via Supabase MCP.)

- [ ] **Step 3: Commit**

```bash
git add apps/expo/supabase/functions/video-upload-url/index.ts
git commit -m "feat(supabase): video-upload-url edge fn mints Cloudflare Stream tus URLs"
git push
```

---

### Task 2: Expo upload library `lib/stream-upload.ts` (TDD)

**Files:**
- Create: `apps/expo/lib/stream-upload.ts`
- Test: `apps/expo/lib/__tests__/stream-upload.test.ts`
- Modify: `apps/expo/package.json` (via `pnpm add tus-js-client`)

**Interfaces:**
- Consumes: Task 1's JSON API via `supabase.functions.invoke('video-upload-url', { body })`; `supabase` client from `apps/expo/lib/supabase.ts`.
- Produces (used by Task 3):
  - `probeStreamConfigured(): Promise<boolean>` — cached 5 min per session
  - `uploadVideoToStream(uri: string, walletAddress: string, onProgress?: (fraction: number) => void): Promise<string | null>` — resolves to the HLS playback URL after `readyToStream`, `null` on any failure
  - `STREAM_CHUNK_SIZE: number`
  - `_resetProbeCacheForTests(): void`

- [ ] **Step 1: Install the dependency**

Run: `cd apps/expo && pnpm add tus-js-client@^4.3.1`
Expected: `tus-js-client 4.x` added to `apps/expo/package.json` dependencies (pure JS — OTA-safe, no EAS build needed).

- [ ] **Step 2: Write the failing test**

Create `apps/expo/lib/__tests__/stream-upload.test.ts`:

```ts
jest.mock('../supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

import { supabase } from '../supabase';
import {
  probeStreamConfigured,
  STREAM_CHUNK_SIZE,
  _resetProbeCacheForTests,
} from '../stream-upload';

const invokeMock = supabase.functions.invoke as jest.Mock;

describe('STREAM_CHUNK_SIZE', () => {
  it('is divisible by 256 KiB and at least 5 MiB (Cloudflare tus requirements)', () => {
    expect(STREAM_CHUNK_SIZE % (256 * 1024)).toBe(0);
    expect(STREAM_CHUNK_SIZE).toBeGreaterThanOrEqual(5 * 1024 * 1024);
  });
});

describe('probeStreamConfigured', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    _resetProbeCacheForTests();
  });

  it('returns true when the edge function reports configured', async () => {
    invokeMock.mockResolvedValue({ data: { configured: true }, error: null });
    await expect(probeStreamConfigured()).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('video-upload-url', {
      body: { action: 'probe' },
    });
  });

  it('caches the result (one invoke for two calls)', async () => {
    invokeMock.mockResolvedValue({ data: { configured: true }, error: null });
    await probeStreamConfigured();
    await probeStreamConfigured();
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('returns false when the edge function errors', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(probeStreamConfigured()).resolves.toBe(false);
  });

  it('returns false when invoke throws', async () => {
    invokeMock.mockRejectedValue(new Error('network'));
    await expect(probeStreamConfigured()).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/expo && npx jest lib/__tests__/stream-upload.test.ts --watchAll=false`
Expected: FAIL — `Cannot find module '../stream-upload'`.

- [ ] **Step 4: Write the implementation**

Create `apps/expo/lib/stream-upload.ts`:

```ts
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
async function waitUntilReady(uid: string, timeoutMs = 180_000): Promise<boolean> {
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/expo && npx jest lib/__tests__/stream-upload.test.ts --watchAll=false`
Expected: PASS (6 tests).

- [ ] **Step 6: Lint the new files**

Run: `cd apps/expo && npx eslint lib/stream-upload.ts lib/__tests__/stream-upload.test.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/expo/lib/stream-upload.ts apps/expo/lib/__tests__/stream-upload.test.ts apps/expo/package.json pnpm-lock.yaml
git commit -m "feat(expo): Cloudflare Stream tus upload lib with probe fallback"
git push
```

---

### Task 3: Expo composer wiring (10-min picker + progress UI)

**Files:**
- Modify: `apps/expo/context/CreatePostContext.tsx` (state type ~line 13-31, initialState ~line 56-74, `pickVideo` ~line 133-151, imports ~line 3)
- Modify: `apps/expo/app/create/index.tsx` (upload indicator ~line 488-496)

**Interfaces:**
- Consumes: `probeStreamConfigured`, `uploadVideoToStream` from Task 2; existing `uploadMediaFile` (unchanged fallback).
- Produces: `uploadProgress: number | null` on the CreatePost draft state (read by `app/create/index.tsx`). `videoUrl` in the draft now may hold an HLS manifest URL — `PostVideoPlayer` needs no changes (expo-video plays HLS natively).

- [ ] **Step 1: Add `uploadProgress` to the draft state**

In `apps/expo/context/CreatePostContext.tsx`:

Add to the `CreatePostState` type after `pendingUploads: number;`:

```ts
  uploadProgress: number | null;
```

Add to `initialState` after `pendingUploads: 0,`:

```ts
  uploadProgress: null,
```

- [ ] **Step 2: Route `pickVideo` through Stream when configured**

Add to the imports at the top of `CreatePostContext.tsx`:

```ts
import { probeStreamConfigured, uploadVideoToStream } from '@/lib/stream-upload';
```

Replace the whole `pickVideo` callback (currently `videoMaxDuration: 60` + `uploadMediaFile`) with:

```ts
  const pickVideo = useCallback(async (walletAddress: string) => {
    // Stream configured → 10-min cap + direct-to-Cloudflare tus upload.
    // Not configured → exactly the legacy behavior (60s, Supabase Storage).
    const useStream = await probeStreamConfigured();

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.8,
      videoMaxDuration: useStream ? 600 : 60,
    });

    if (result.canceled) return;

    setState((prev) => ({ ...prev, isUploading: true, uploadProgress: useStream ? 0 : null }));

    const asset = result.assets[0];
    const url = useStream
      ? await uploadVideoToStream(asset.uri, walletAddress, (fraction) =>
          setState((prev) => ({ ...prev, uploadProgress: fraction })),
        )
      : await uploadMediaFile(asset.uri, walletAddress, 'video', 'posts', asset.mimeType || undefined);

    setState((prev) => ({
      ...prev,
      videoUrl: url,
      isUploading: false,
      uploadProgress: null,
    }));
  }, []);
```

- [ ] **Step 3: Show percent + processing state in the upload indicator**

In `apps/expo/app/create/index.tsx`, replace the upload indicator block:

```tsx
          {/* Upload indicator (video only — image uploads show inline skeletons) */}
          {draft.isUploading && draft.pendingUploads === 0 && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>
                Wird hochgeladen...
              </Text>
            </View>
          )}
```

with:

```tsx
          {/* Upload indicator (video only — image uploads show inline skeletons) */}
          {draft.isUploading && draft.pendingUploads === 0 && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>
                {draft.uploadProgress == null
                  ? 'Wird hochgeladen...'
                  : draft.uploadProgress >= 1
                    ? 'Video wird verarbeitet…'
                    : `Wird hochgeladen… ${Math.round(draft.uploadProgress * 100)} %`}
              </Text>
            </View>
          )}
```

- [ ] **Step 4: Lint + run the expo test suite**

Run: `cd apps/expo && npx eslint context/CreatePostContext.tsx app/create/index.tsx && npx jest lib/__tests__ --watchAll=false`
Expected: eslint clean on both files; all lib tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/expo/context/CreatePostContext.tsx apps/expo/app/create/index.tsx
git commit -m "feat(expo): 10-min post videos via Cloudflare Stream with upload progress"
git push
```

---

### Task 4: Web upload library + PostComposer gating

**Files:**
- Create: `apps/web/src/lib/stream-upload.ts`
- Modify: `apps/web/src/components/app/PostComposer.tsx` (imports ~line 14, `uploadToStorage` video branch ~line 187-205)

**Interfaces:**
- Consumes: Task 1's JSON API via `createClient()` from `@/lib/supabase/client`; existing `uploadResumable` stays as the fallback.
- Produces (used within PostComposer; Task 5 does not depend on it):
  - `probeStreamConfigured(): Promise<boolean>`
  - `uploadVideoToStream(file: File, walletAddress: string, onProgress?: (pct: number) => void): Promise<string | null>` — note: web progress is **0–100** (matches the existing `videoUploadProgress` state), unlike expo's 0–1.

- [ ] **Step 1: Create `apps/web/src/lib/stream-upload.ts`**

```ts
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

let probeCache: { configured: boolean; at: number } | null = null;

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
async function waitUntilReady(uid: string, timeoutMs = 180_000): Promise<boolean> {
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
```

- [ ] **Step 2: Gate the PostComposer video branch**

In `apps/web/src/components/app/PostComposer.tsx`, add below the `uploadResumable` import:

```ts
import { probeStreamConfigured, uploadVideoToStream } from "@/lib/stream-upload";
```

Replace the video branch of `uploadToStorage`:

```ts
    if (type === "video") {
      try {
        setVideoUploadProgress(0);
        const url = await uploadResumable({
          file,
          bucket: "images",
          path: fileName,
          contentType: file.type || "video/mp4",
          onProgress: (pct) => setVideoUploadProgress(pct),
        });
        return url;
      } catch (err) {
        console.error("Resumable upload error:", err);
        toast.error("Video-Upload fehlgeschlagen. Bitte versuche es erneut.");
        return null;
      } finally {
        setVideoUploadProgress(null);
      }
    }
```

with:

```ts
    if (type === "video") {
      try {
        setVideoUploadProgress(0);
        // Cloudflare Stream (adaptive HLS) when configured; Supabase Storage otherwise.
        if (await probeStreamConfigured()) {
          const url = await uploadVideoToStream(file, account?.address ?? "", (pct) =>
            setVideoUploadProgress(pct),
          );
          if (!url) toast.error("Video-Upload fehlgeschlagen. Bitte versuche es erneut.");
          return url;
        }
        const url = await uploadResumable({
          file,
          bucket: "images",
          path: fileName,
          contentType: file.type || "video/mp4",
          onProgress: (pct) => setVideoUploadProgress(pct),
        });
        return url;
      } catch (err) {
        console.error("Resumable upload error:", err);
        toast.error("Video-Upload fehlgeschlagen. Bitte versuche es erneut.");
        return null;
      } finally {
        setVideoUploadProgress(null);
      }
    }
```

- [ ] **Step 3: Lint**

Run: `cd apps/web && npx eslint src/lib/stream-upload.ts src/components/app/PostComposer.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/stream-upload.ts apps/web/src/components/app/PostComposer.tsx
git commit -m "feat(web): post video uploads via Cloudflare Stream when configured"
git push
```

---

### Task 5: Web HLS playback (hls.js in VideoPlayer + MediaLightbox)

**Files:**
- Create: `apps/web/src/hooks/useHlsVideo.ts`
- Modify: `apps/web/src/components/app/VideoPlayer.tsx` (video element ~line 68-83)
- Modify: `apps/web/src/components/app/MediaLightbox.tsx` (video element ~line 83-92)
- Modify: `apps/web/package.json` (via `pnpm add hls.js`)

**Interfaces:**
- Consumes: nothing from other tasks (any `.m3u8` URL in `video_url`).
- Produces:
  - `isHlsUrl(url: string): boolean`
  - `hlsPosterUrl(url: string): string | null` — Cloudflare Stream thumbnail for a manifest URL
  - `useHlsVideo(videoRef: RefObject<HTMLVideoElement | null>, url: string): void`

- [ ] **Step 1: Install hls.js**

Run: `cd apps/web && pnpm add hls.js@^1.6.0`
Expected: `hls.js 1.6.x` in `apps/web/package.json` dependencies (loaded via dynamic import only — stays out of the main bundle).

- [ ] **Step 2: Create `apps/web/src/hooks/useHlsVideo.ts`**

```ts
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
```

- [ ] **Step 3: Wire into `VideoPlayer.tsx`**

Add the import:

```ts
import { useHlsVideo, isHlsUrl, hlsPosterUrl } from "@/hooks/useHlsVideo";
```

Add inside the component, after the refs (~line 13):

```ts
  useHlsVideo(videoRef, url);
```

Change the `<video>` element's `src` and add a poster (leave every other prop untouched):

```tsx
      <video
        ref={videoRef}
        src={isHlsUrl(url) ? undefined : url}
        poster={hlsPosterUrl(url) ?? undefined}
```

- [ ] **Step 4: Wire into `MediaLightbox.tsx`**

Add imports (`useRef` may already be imported — extend the existing react import if so):

```ts
import { useRef } from "react";
import { useHlsVideo, isHlsUrl } from "@/hooks/useHlsVideo";
```

Add inside the component, before the return:

```ts
  const lightboxVideoRef = useRef<HTMLVideoElement>(null);
  useHlsVideo(lightboxVideoRef, videoUrl ?? "");
```

Change the video element (~line 85):

```tsx
              <video
                ref={lightboxVideoRef}
                src={videoUrl && isHlsUrl(videoUrl) ? undefined : videoUrl ?? undefined}
                className="w-full max-h-[85vh] object-contain"
                controls
                autoPlay
                playsInline
              />
```

- [ ] **Step 5: Lint**

Run: `cd apps/web && npx eslint src/hooks/useHlsVideo.ts src/components/app/VideoPlayer.tsx src/components/app/MediaLightbox.tsx`
Expected: no errors.

- [ ] **Step 6: Manual playback smoke test (no Cloudflare account needed)**

Run: `pnpm dev:web`, then temporarily point any post's `video_url` in the local render (or a scratch page) at the public test stream `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8` and confirm it plays in Chrome (hls.js path). Skip if no browser available — the fallback (MP4) path is unchanged by construction (`isHlsUrl` false → identical rendering).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/hooks/useHlsVideo.ts apps/web/src/components/app/VideoPlayer.tsx apps/web/src/components/app/MediaLightbox.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): HLS playback (hls.js) for Stream videos in player + lightbox"
git push
```

---

### Task 6: Final verification + ops handoff

**Files:**
- No new files (verification only).

**Interfaces:**
- Consumes: everything above.
- Produces: green checks + the user's go-live checklist.

- [ ] **Step 1: Full expo test suite**

Run: `cd apps/expo && npx jest lib/__tests__ context/__tests__ --watchAll=false`
Expected: all PASS (including pre-existing tests — proves no regressions in shared modules).

- [ ] **Step 2: Fallback behavior check**

Confirm by reading the final diffs: with `probeStreamConfigured()` → `false` (edge fn undeployed/unconfigured), `pickVideo` uses `videoMaxDuration: 60` + `uploadMediaFile`, and PostComposer uses `uploadResumable` — byte-for-byte today's behavior.

- [ ] **Step 3: Report the ops gate to the user**

Deliver this checklist (from the spec):
1. Create Cloudflare account → enable Stream ($5/mo).
2. Create API token with `Stream:Edit` permission.
3. Read the `customer-xxxx` playback subdomain from Dashboard → Stream.
4. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, `CLOUDFLARE_STREAM_CUSTOMER_CODE` as Edge Function secrets and deploy `video-upload-url` (Supabase MCP, needs interactive auth).
5. Live test: >60s video from Expo + web; HLS playback in app, Chrome/Firefox (hls.js), Safari (native).
