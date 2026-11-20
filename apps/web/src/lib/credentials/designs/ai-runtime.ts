// Production adapters for the card designer's AI help (designs/ai.ts): kie.ai text-to-image,
// background removal and the KI-Kosten ledger. Server-only; never loaded by tests.
import "server-only";
import { createKieImageTask, KieImageError, pollKieImageTask, recordKieImage, resolveKieModel } from "@/lib/images/kie";
import { AiGenerationError, AiTimeoutError, AI_TIMEOUT_MS, BACKGROUND_REMOVAL_MODEL, type AiDeps, type AiGenerateInput } from "./ai";
import { designDeps } from "./runtime";

const POLL_INTERVAL_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new AiGenerationError("Das erzeugte Bild konnte nicht geladen werden.");
  return new Uint8Array(await res.arrayBuffer());
}

/** Starts a kie.ai job and waits for its image within `budgetMs`. */
async function runKie(prompt: string, aspectRatio: AiGenerateInput["aspectRatio"], budgetMs: number): Promise<string> {
  const started = Date.now();
  let taskId: string;
  try {
    taskId = await createKieImageTask({ prompt, aspectRatio });
  } catch (err) {
    throw err instanceof KieImageError ? new AiGenerationError(err.message) : err;
  }
  while (Date.now() - started < budgetMs) {
    const task = await pollKieImageTask(taskId);
    if (task.state === "success") return task.url;
    if (task.state === "fail") {
      console.error("[credentials/designs/ai] kie job failed:", taskId, task.error);
      throw new AiGenerationError("Das Bild konnte nicht erzeugt werden. Bitte beschreibe es etwas anders.");
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new AiTimeoutError("kie.ai budget");
}

export function aiDeps(): AiDeps {
  return {
    ...designDeps(),
    generatorName: `Röbel App / kie.ai ${resolveKieModel(process.env.KIE_IMAGE_MODEL)}`,
    async generate(input) {
      // A little under the action's budget, so the download still fits.
      const url = await runKie(input.prompt, input.aspectRatio, AI_TIMEOUT_MS - 8_000);
      const bytes = await download(url);
      void recordKieImage(input.feature).catch(() => undefined);
      return bytes;
    },
    async removeBackground() {
      // kie.ai removal models take an image URL; none is wired yet (BACKGROUND_REMOVAL_MODEL).
      if (!BACKGROUND_REMOVAL_MODEL) throw new Error("no background-removal model configured");
      throw new Error(`background removal via ${BACKGROUND_REMOVAL_MODEL} not implemented`);
    },
  };
}
