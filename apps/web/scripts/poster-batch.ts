// One-off/reusable batch: propose posters for every upcoming event that has no
// open batch and no review yet. Run from apps/web:
//   set -a; source .env.local; set +a; pnpm exec tsx scripts/poster-batch.ts [--limit N] [--dry]
import { createAdminClient } from "../src/lib/supabase/admin";
import { proposePosters, PosterServiceError } from "../src/lib/poster/service";

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) || 100 : 100;
const dry = args.includes("--dry");

interface Row {
  id: string;
  title: string;
  date: string;
}

async function main() {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: events, error } = await admin
    .from("events")
    .select("id, title, date")
    .gte("date", today)
    .in("status", ["approved", "pending"])
    .is("poster_reviewed_at", null)
    .order("date", { ascending: true });
  if (error) throw error;
  const { data: open } = await admin.from("event_poster_proposals").select("event_id").eq("status", "proposed");
  const openIds = new Set(((open ?? []) as Array<{ event_id: string | null }>).map((r) => r.event_id));
  const queue = ((events ?? []) as Row[]).filter((e) => !openIds.has(e.id)).slice(0, limit);
  console.log(`${queue.length} events to process${dry ? " (dry run)" : ""}`);
  let total = 0;
  for (const e of queue) {
    const started = Date.now();
    if (dry) {
      console.log(`- ${e.title} (${e.date})`);
      continue;
    }
    try {
      const res = await proposePosters({ kind: "event", eventId: e.id }, { requestedBy: "admin" });
      const secs = Math.round((Date.now() - started) / 1000);
      if ("skipped" in res) console.log(`= ${e.title}: skipped (${res.skipped}) ${secs}s`);
      else {
        total += res.costUsd;
        console.log(
          `+ ${e.title}: ${res.mode} ${res.proposals.map((p) => p.direction).join("/")} $${res.costUsd.toFixed(3)} ${secs}s`,
        );
      }
    } catch (err) {
      console.error(`! ${e.title}:`, err instanceof Error ? err.message : err);
      if (err instanceof PosterServiceError && (err.code === "billing" || err.code === "caps")) {
        console.error(`stopping: ${err.code}`);
        break;
      }
    }
  }
  console.log(`done, $${total.toFixed(2)} spent`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
