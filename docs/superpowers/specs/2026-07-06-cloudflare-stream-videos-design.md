# Cloudflare Stream post videos (Expo + Web) — Design

**Date:** 2026-07-06
**Status:** Approved
**Problem:** Users want to post ~10-minute "update videos". Today both apps upload raw
MP4s to Supabase Storage: the Expo path reads the whole file into memory as base64
(crashes on large files), playback is a single fixed-quality progressive download, and
Supabase egress is billed per GB. YouTube is not an option because its ToS only allows
playback through the YouTube player (no native player).

## Decisions (user-confirmed)

1. **All new post videos** go through Cloudflare Stream (short clips too) — one pipeline.
2. **Everyone** may upload up to 10 minutes (no role gating).
3. User has **no Cloudflare account yet** — build everything now; account + secrets are
   the final ops gate. Until secrets are set, uploads fall back to exactly today's
   behavior (60s cap, Supabase Storage).

## Architecture

- One new Supabase Edge Function **`video-upload-url`** is the single Cloudflare
  integration point. Secrets live only in Supabase Edge Function secrets.
- Both apps call it via `supabase.functions.invoke`, then upload **directly to
  Cloudflare** with the **tus** protocol (`tus-js-client`, pure JS — OTA-safe for Expo,
  required because 10-min phone videos exceed the 200 MB basic-upload cap).
- The returned **HLS manifest URL**
  (`https://customer-<code>.cloudflarestream.com/<uid>/manifest/video.m3u8`) is stored in
  the existing `posts.video_url` column. **Zero schema changes.** Existing Supabase MP4
  URLs keep playing everywhere (players handle both).

## Components

### 1. Edge Function `video-upload-url` (apps/expo/supabase/functions/)

Anon-invocable, CORS `*`, wallet in body — same conventions as `spend-muenzen`.
Three actions in one function:

| action  | request                      | response                                        |
|---------|------------------------------|-------------------------------------------------|
| `probe` | `{ action:'probe' }`         | `{ configured: boolean }`                       |
| `create`| `{ action:'create', wallet, uploadLength }` | `{ uploadUrl, uid, playbackUrl, thumbnailUrl }` |
| `status`| `{ action:'status', uid }`   | `{ readyToStream: boolean, state?: string }`    |

- `create` calls `POST /client/v4/accounts/{ACCOUNT_ID}/stream?direct_user=true` with
  tus creation headers (`Upload-Length`, `Upload-Metadata: maxdurationseconds <b64(600)>`)
  and returns Cloudflare's `Location` header as `uploadUrl`, `stream-media-id` as `uid`.
  `maxDurationSeconds=600` is the **server-side** cap (limits abuse regardless of client).
- `status` proxies `GET /client/v4/accounts/{ACCOUNT_ID}/stream/{uid}` → `readyToStream`.
- Secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`,
  `CLOUDFLARE_STREAM_CUSTOMER_CODE` (playback subdomain). Any missing →
  `probe` returns `{ configured:false }`; `create`/`status` return 503
  `{ error:'stream_not_configured' }`. Never a hard crash.

### 2. Expo (apps/expo)

- New **`lib/stream-upload.ts`**: `probeStreamConfigured()`, `uploadVideoToStream(uri,
  wallet, onProgress)` (create → tus upload with progress → poll `status` until
  `readyToStream`, timeout ~3 min → returns `playbackUrl` or null).
- **`context/CreatePostContext.tsx`** `pickVideo`: probe first → configured:
  `videoMaxDuration: 600` + Stream path (never reads the file into memory);
  not configured: today's exact path (60s, `uploadMediaFile`).
- Upload progress: reuse existing `isUploading` flag; add optional `uploadProgress`
  (0–1) to draft state, shown in the existing upload indicator in `app/create/index.tsx`.
- **`components/feed/PostVideoPlayer.tsx`**: no changes — expo-video plays HLS natively
  (AVPlayer/ExoPlayer).
- Dependency: `tus-js-client` (pure JS).

### 3. Web (apps/web)

- New **`src/lib/stream-upload.ts`**: same probe/create/tus/poll flow with browser `File`.
- **`components/ui/video-upload-dropzone.tsx`** + **`components/app/PostComposer.tsx`**:
  probe → Stream path with progress; fallback = current Supabase upload.
- Playback: new tiny **`useHlsVideo`** hook (or inline logic) used by
  **`components/app/VideoPlayer.tsx`** and **`components/app/MediaLightbox.tsx`**:
  if URL contains `.m3u8` and the browser lacks native HLS
  (`video.canPlayType('application/vnd.apple.mpegurl')` — Safari has it), lazily
  `import('hls.js')` and attach. MP4 URLs render exactly as today.
- Poster: derive `…/thumbnails/thumbnail.jpg` from the manifest URL for `.m3u8` sources.
- Dependencies: `tus-js-client`, `hls.js` (dynamic import, stays out of the main bundle).

## Scope

Post videos only: both composers + both post players (incl. lightbox). Experiences,
ads, stories, comments keep their current pipeline; they can adopt the shared edge
function + upload libs later. No deletion lifecycle in v1 (orphaned Stream videos cost
~0.5 ct/month each; follow-up if it matters).

## Error handling

- Secrets unset → silent fallback to legacy path (probe-gated), UX unchanged.
- tus upload failure → same UX as today's failed upload (null URL, user can retry);
  tus auto-retries transient network errors.
- Processing timeout (rare) → treat as failed upload; the post is never created with a
  dead manifest URL because the composer only gets the URL after `readyToStream`.

## Ops gate (user, after implementation)

1. Create Cloudflare account, enable Stream ($5/mo, 1,000 min storage included;
   delivery $1/1,000 min watched).
2. Create an API token with `Stream:Edit` permission.
3. Find the customer playback subdomain (Dashboard → Stream → any video → it's in the
   HLS URL, `customer-xxxx`).
4. Set the 3 secrets on Supabase Edge Functions and deploy `video-upload-url`
   (via Supabase MCP).
5. Live test: upload a >60s video from Expo + web, confirm HLS playback in both, and
   in Chrome/Firefox (hls.js) + Safari (native).

## Testing

- Fallback path verified locally (probe returns `configured:false` → behavior identical
  to today).
- Web playback of a public sample HLS stream through the modified `VideoPlayer`
  (verifiable without a Cloudflare account).
- Live end-to-end (upload → transcode → HLS in both apps) only after the ops gate.
