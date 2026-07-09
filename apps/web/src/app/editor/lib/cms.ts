// Mini-CMS pre-flight for the editor: before the FIRST build, ask the server
// whether the app would benefit from sdk.data content keys. If yes, the chat
// shows the CmsSetupCard (keys editable), and the confirmed plan is appended
// to the build prompt so the app is generated CMS-wired; after publishing,
// the same keys are seeded as initial content ("Inhalte" section).

export interface CmsKeyPlan {
  key: string;
  beschreibung: string;
  /** example JSON structure — becomes the seeded initial content */
  beispiel: unknown;
}

export interface CmsUserKeyPlan {
  key: string;
  beschreibung: string;
}

export interface CmsPlan {
  cms: boolean;
  reason?: string;
  keys: CmsKeyPlan[];
  userKeys: CmsUserKeyPlan[];
}

const CHECK_TIMEOUT_MS = 12_000;

/** Ask the server for a CMS plan. Fails soft (null = build without CMS). */
export async function fetchCmsPlan(idea: string): Promise<CmsPlan | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    const res = await fetch("/api/mini-apps/cms-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const plan = (await res.json()) as CmsPlan;
    if (!plan || typeof plan.cms !== "boolean") return null;
    plan.keys = plan.keys ?? [];
    plan.userKeys = plan.userKeys ?? [];
    return plan.cms && plan.keys.length === 0 ? { ...plan, cms: false } : plan;
  } catch {
    return null;
  }
}

/** The block appended to the user's prompt once the plan is confirmed. */
export function buildCmsPromptBlock(keys: CmsKeyPlan[], userKeys: CmsUserKeyPlan[]): string {
  const lines: string[] = [
    "",
    "[Mini-CMS Einrichtung — diese App nutzt den Daten-Speicher der Plattform]",
    "Die Inhalte der App werden später im Dashboard gepflegt. Verwende EXAKT diese Schlüssel:",
  ];
  for (const k of keys) {
    lines.push(
      `- sdk.data.get("${k.key}") — ${k.beschreibung}. Struktur (Beispiel): ${JSON.stringify(k.beispiel)}`,
    );
  }
  lines.push(
    "Baue für JEDEN Schlüssel eine eingebaute Fallback-Konstante mit vollständigen, realistischen Demo-Inhalten in GENAU dieser Struktur und überschreibe sie beim Start per sdk.data.get(...), wenn exists (try/catch, App läuft auch ohne Host).",
  );
  if (userKeys.length > 0) {
    lines.push("Nutzer-Zustand (pro Person, sdk.data.getUser/setUser):");
    for (const k of userKeys) {
      lines.push(`- "${k.key}" — ${k.beschreibung}. Beim Start laden, bei Änderung speichern (try/catch).`);
    }
  }
  return lines.join("\n");
}

/** Seed the confirmed keys as initial app content after a FRESH publish. */
export async function seedCmsContent(
  appRef: string,
  wallet: string,
  keys: CmsKeyPlan[],
): Promise<number> {
  let ok = 0;
  for (const k of keys) {
    try {
      const res = await fetch("/api/mini-apps/data", {
        method: "POST",
        headers: { "content-type": "application/json", "x-wallet-address": wallet },
        body: JSON.stringify({ app: appRef, scope: "app", key: k.key, value: k.beispiel ?? null }),
      });
      if (res.ok) ok++;
    } catch {
      /* seeding is best-effort — the Inhalte section can add keys anytime */
    }
  }
  return ok;
}
