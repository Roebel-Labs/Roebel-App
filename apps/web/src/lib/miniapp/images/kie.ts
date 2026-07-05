// KIE.ai job client for Nano Banana 2 (Google Gemini 3.1 Flash Image).
// Same createTask/recordInfo contract as the generate-menu-image edge
// function; 1:1 PNG output for app icons + store previews.
import "server-only";
import { MiniAppError } from "../types";

const KIE_CREATE = "https://api.kie.ai/api/v1/jobs/createTask";
const KIE_POLL = "https://api.kie.ai/api/v1/jobs/recordInfo";
const MODEL = "nano-banana-2";

function kieKey(): string {
  const key = process.env.KIE_API_KEY;
  if (!key) {
    throw new MiniAppError(
      "internal",
      "Bildgenerierung ist nicht konfiguriert (KIE_API_KEY fehlt).",
      503,
    );
  }
  return key;
}

export async function createImageTask(opts: {
  prompt: string;
  referenceUrls?: string[];
}): Promise<string> {
  const res = await fetch(KIE_CREATE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${kieKey()}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: {
        prompt: opts.prompt,
        image_input: opts.referenceUrls ?? [],
        aspect_ratio: "1:1",
        output_format: "png",
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[miniapp/images] KIE createTask failed:", res.status, txt.slice(0, 300));
    throw new MiniAppError("internal", "Bildgenerierung konnte nicht gestartet werden.", 502);
  }
  const json = (await res.json()) as { data?: { taskId?: string } };
  const taskId = json.data?.taskId;
  if (!taskId) {
    throw new MiniAppError("internal", "Bildgenerierung konnte nicht gestartet werden.", 502);
  }
  return taskId;
}

export type ImageTaskState =
  | { state: "pending" }
  | { state: "success"; url: string }
  | { state: "fail"; error: string };

export async function getImageTask(taskId: string): Promise<ImageTaskState> {
  const res = await fetch(`${KIE_POLL}?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${kieKey()}` },
  });
  if (!res.ok) {
    return { state: "pending" };
  }
  const json = (await res.json()) as {
    data?: { state?: string; resultJson?: string; failMsg?: string };
  };
  const state = json.data?.state;
  if (state === "success") {
    try {
      const parsed = JSON.parse(json.data?.resultJson ?? "{}") as {
        resultUrls?: string[];
      };
      const url = parsed.resultUrls?.[0];
      if (url) return { state: "success", url };
    } catch {
      // fällt unten auf "fail" durch
    }
    return { state: "fail", error: "Kein Bild im Ergebnis." };
  }
  if (state === "fail") {
    return { state: "fail", error: json.data?.failMsg || "Generierung fehlgeschlagen." };
  }
  return { state: "pending" };
}
