import { createClient } from "npm:@supabase/supabase-js@2";

// Storage maintenance function (deployed 2026-08-29, invoked weekly by the
// pg_cron job `storage-orphan-cleanup-weekly`, see
// supabase/migrations/20260829_storage_cleanup_helpers.sql).
//
// Actions:
//   dry-run  — list orphaned storage objects (per-folder summary)
//   delete   — delete orphans via the Storage API (SQL deletes would leave
//              the underlying S3 blobs behind)
//   reencode — shrink oversized originals in place via the render endpoint
//              (width-capped, format preserved). Runs weekly via pg_cron so
//              oversized uploads from any source get compressed within a
//              week. Processed files are marked with cacheControl
//              max-age=31536000 (the RPC excludes them), including files
//              that could not be shrunk, so nothing is re-fetched weekly.
//
// Threat model of the shared secret: it only gates actions that (a) list or
// delete objects the DB provably does not reference anymore (7-day age guard,
// approved prefixes only — see storage_cleanup_list_orphans()) or (b)
// re-encode images in place. It cannot delete referenced data.
const SECRET = "rblclean_7f2d91c4a8e35b06";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

Deno.serve(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  if (body.secret !== SECRET) return json({ error: "forbidden" }, 403);
  const action = body.action ?? "dry-run";

  if (action === "dry-run" || action === "delete") {
    const { data, error } = await supabase.rpc("storage_cleanup_list_orphans");
    if (error) return json({ error: error.message }, 500);
    const orphans = (data ?? []) as { bucket_id: string; name: string; size_bytes: number }[];

    const summary: Record<string, { count: number; mb: number }> = {};
    let totalBytes = 0;
    for (const o of orphans) {
      const folder = o.name.includes("/") ? o.name.split("/")[0] : "(root)";
      const key = `${o.bucket_id}/${folder}`;
      summary[key] ??= { count: 0, mb: 0 };
      summary[key].count++;
      summary[key].mb += o.size_bytes / 1048576;
      totalBytes += o.size_bytes;
    }
    for (const k of Object.keys(summary)) summary[k].mb = Math.round(summary[k].mb * 10) / 10;

    if (action === "dry-run") {
      return json({ action, total: orphans.length, totalMB: Math.round(totalBytes / 1048576), summary });
    }

    const byBucket = new Map<string, string[]>();
    for (const o of orphans) {
      if (!byBucket.has(o.bucket_id)) byBucket.set(o.bucket_id, []);
      byBucket.get(o.bucket_id)!.push(o.name);
    }
    let deleted = 0;
    const errors: string[] = [];
    for (const [bucket, paths] of byBucket) {
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { data: d, error: e } = await supabase.storage.from(bucket).remove(chunk);
        if (e) errors.push(`${bucket}: ${e.message}`);
        else deleted += d?.length ?? chunk.length;
      }
    }
    return json({ action, deleted, totalMB: Math.round(totalBytes / 1048576), errors });
  }

  if (action === "reencode") {
    const limit = Math.min(body.limit ?? 10, 25);
    const offset = body.offset ?? 0;
    const minBytes = body.minBytes ?? 800000;
    const { data, error } = await supabase.rpc("storage_list_large_images", { min_bytes: minBytes });
    if (error) return json({ error: error.message }, 500);
    const all = (data ?? []) as { bucket_id: string; name: string; size_bytes: number; mimetype: string }[];
    const targets = all.slice(offset, offset + limit);

    const results: unknown[] = [];
    let ok = 0;
    let skipped = 0;

    // Re-upload the untouched original with the "processed" cacheControl
    // marker so the RPC stops returning it (used when a shrink isn't possible).
    const markProcessed = async (t: { bucket_id: string; name: string; mimetype: string }) => {
      const { data: orig, error: dlErr } = await supabase.storage.from(t.bucket_id).download(t.name);
      if (dlErr || !orig) return dlErr?.message ?? "download failed";
      const { error: upErr } = await supabase.storage.from(t.bucket_id).upload(t.name, orig, {
        upsert: true,
        contentType: t.mimetype === "image/jpg" ? "image/jpeg" : t.mimetype,
        cacheControl: "31536000",
      });
      return upErr?.message ?? null;
    };

    for (const t of targets) {
      const isAvatar = t.bucket_id === "profile-pictures" || t.name.startsWith("profile-pictures/");
      const width = isAvatar ? 512 : (body.maxWidth ?? 1600);
      const url = `${supabaseUrl}/storage/v1/render/image/public/${t.bucket_id}/${encodePath(t.name)}?width=${width}&quality=80&resize=contain&format=origin`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const markErr = await markProcessed(t);
          results.push({ name: t.name, error: `render ${res.status}`, marked: markErr ?? true });
          skipped++;
          continue;
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length === 0 || buf.length >= t.size_bytes) {
          const markErr = await markProcessed(t);
          results.push({ name: t.name, skipped: "not smaller", marked: markErr ?? true });
          skipped++;
          continue;
        }
        const { error: upErr } = await supabase.storage.from(t.bucket_id).upload(t.name, buf, {
          upsert: true,
          contentType: t.mimetype === "image/jpg" ? "image/jpeg" : t.mimetype,
          cacheControl: "31536000",
        });
        if (upErr) {
          results.push({ name: t.name, error: upErr.message });
          skipped++;
        } else {
          results.push({ name: t.name, from: t.size_bytes, to: buf.length });
          ok++;
        }
      } catch (e) {
        results.push({ name: t.name, error: String(e) });
        skipped++;
      }
    }
    return json({ action, candidates: all.length, offset, processed: ok, skipped, results });
  }

  return json({ error: "unknown action" }, 400);
});
