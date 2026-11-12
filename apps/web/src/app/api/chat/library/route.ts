import { NextResponse } from "next/server";
import * as store from "@/lib/chat/store";
import { handleError, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

interface LibraryFile {
  id: string; name: string; ext: string; size: number; kind: "document" | "image"; url: string | null;
  threadId: string; threadTitle: string; routineTitle: string | null; createdAt: string;
}

/** GET /api/chat/library → {files, collections}: every file and generated image across the person's chats. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    const db = store.db();
    const [threadsRes, filesRes, routinesRes] = await Promise.all([
      db.from("chat_threads").select("id, title, topic").eq("owner_wallet", wallet).limit(500),
      db.from("chat_files").select("id, name, ext, size, thread_id, created_at").eq("owner_wallet", wallet).order("created_at", { ascending: false }).limit(300),
      db.from("chat_routines").select("thread_id, title").eq("owner_wallet", wallet),
    ]);
    if (threadsRes.error) throw new Error(threadsRes.error.message);
    if (filesRes.error) throw new Error(filesRes.error.message);
    const threads = new Map((threadsRes.data as { id: string; title: string; topic: string | null }[]).map((t) => [t.id, t.topic || t.title]));
    const routines = new Map(((routinesRes.data ?? []) as { thread_id: string; title: string }[]).map((r) => [r.thread_id, r.title]));

    const files: LibraryFile[] = (filesRes.data as { id: string; name: string; ext: string; size: number; thread_id: string; created_at: string }[]).map((f) => ({
      id: f.id, name: f.name, ext: f.ext, size: f.size, kind: "document", url: null,
      threadId: f.thread_id, threadTitle: threads.get(f.thread_id) ?? "Chat", routineTitle: routines.get(f.thread_id) ?? null, createdAt: f.created_at,
    }));

    // Generated images live as message parts.
    const threadIds = [...threads.keys()];
    if (threadIds.length) {
      const imgRes = await db.from("chat_messages").select("id, thread_id, parts, created_at")
        .in("thread_id", threadIds.slice(0, 200)).contains("parts", [{ type: "generated_image" }])
        .order("created_at", { ascending: false }).limit(120);
      if (!imgRes.error) {
        for (const m of imgRes.data as { id: string; thread_id: string; parts: unknown; created_at: string }[]) {
          for (const p of store.partsOf(m.parts)) {
            if (p.type !== "generated_image") continue;
            const img = p as unknown as { imageId: string; url?: string | null; title?: string | null; prompt?: string | null; status?: string };
            if (!img.url || !/^https:\/\//.test(img.url)) continue;
            files.push({
              id: `img:${img.imageId}`, name: (img.title || img.prompt || "Bild").slice(0, 80), ext: "jpg", size: 0, kind: "image", url: img.url,
              threadId: m.thread_id, threadTitle: threads.get(m.thread_id) ?? "Chat", routineTitle: routines.get(m.thread_id) ?? null, createdAt: m.created_at,
            });
          }
        }
      }
    }
    files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const collections: { id: string; label: string; count: number; kind: "recent" | "thread" | "routine" }[] = [
      { id: "recent", label: "Zuletzt", count: files.length, kind: "recent" },
    ];
    const byRoutine = new Map<string, number>();
    const byThread = new Map<string, { label: string; count: number }>();
    for (const f of files) {
      if (f.routineTitle) byRoutine.set(f.routineTitle, (byRoutine.get(f.routineTitle) ?? 0) + 1);
      else {
        const t = byThread.get(f.threadId) ?? { label: f.threadTitle, count: 0 };
        t.count++;
        byThread.set(f.threadId, t);
      }
    }
    for (const [title, count] of byRoutine) collections.push({ id: `routine:${title}`, label: title, count, kind: "routine" });
    for (const [id, t] of [...byThread].sort((a, b) => b[1].count - a[1].count).slice(0, 12)) collections.push({ id: `thread:${id}`, label: t.label, count: t.count, kind: "thread" });

    return NextResponse.json({ files, collections });
  } catch (err) {
    return handleError(err, "library");
  }
}
