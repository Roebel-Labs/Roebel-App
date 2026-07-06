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

// Hard server-side cap. Cloudflare validates AFTER the full upload, so keep
// comfortable headroom over the advertised "10 minutes" — a 10:03 recording
// must not burn a 1 GB upload. Clients pre-check against the same value.
const MAX_DURATION_SECONDS = 900; // 15 min
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
  // Accept "xxx", "customer-xxx", "customer-xxx.cloudflarestream.com" or a full URL.
  const customerCode = rawCode
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^customer-/, "")
    .replace(/\.cloudflarestream\.com.*$/, "")
    .replace(/\/.*$/, "");
  if (!customerCode) return null;
  return { accountId, apiToken, customerCode };
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
        errorReasonCode: data?.result?.status?.errorReasonCode ?? null,
        errorReasonText: data?.result?.status?.errorReasonText ?? null,
        pctComplete: data?.result?.status?.pctComplete ?? null,
        duration: data?.result?.duration ?? null,
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("[video-upload-url] error:", err);
    return json({ error: "internal_error" }, 500);
  }
});
