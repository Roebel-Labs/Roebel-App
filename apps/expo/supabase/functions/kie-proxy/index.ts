// kie-proxy — minimal authenticated forwarder to kie.ai for server-side
// callers that don't hold KIE_API_KEY (the Vercel mini-app image routes).
// Callers authenticate with x-seed-token (must match the SEED_TOKEN secret);
// KIE_API_KEY stays a Supabase-only secret. Only the two fixed KIE job
// endpoints are reachable — this is not an open proxy.
//
// Deploy with verify_jwt=false — the token check below is the auth.

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("SEED_TOKEN");
  if (!expected || req.headers.get("x-seed-token") !== expected) {
    return json(401, { error: "unauthorized" });
  }
  const kieKey = Deno.env.get("KIE_API_KEY");
  if (!kieKey) return json(503, { error: "kie_key_missing" });

  let body: { action?: unknown; payload?: unknown; taskId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  try {
    if (body.action === "createTask") {
      const res = await fetch(`${KIE_BASE}/createTask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${kieKey}`,
        },
        body: JSON.stringify(body.payload ?? {}),
      });
      return new Response(await res.text(), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (body.action === "recordInfo") {
      const taskId = typeof body.taskId === "string" ? body.taskId : "";
      if (!taskId) return json(400, { error: "taskId_required" });
      const res = await fetch(
        `${KIE_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${kieKey}` } },
      );
      return new Response(await res.text(), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return json(400, { error: "unknown_action" });
  } catch (e) {
    console.error("[kie-proxy] forward failed", e);
    return json(502, { error: "kie_unreachable" });
  }
});
