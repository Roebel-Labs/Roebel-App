// Mini-app templates: finished single-file apps someone starts from and then adapts in chat
// (Langdock-style "App-Templates", but publishable to members and the public).
//
// A template is built on the shared BOILERPLATE, so it follows the same contract as every
// AI-built app (screens, preview states, SDK, design system) and stays editable in /editor and
// in the Ortis Studio builder. `cms` seeds the app's Inhalte on its first publish.
import { BOILERPLATE, SDK_ESM_URL } from "../ai/htmlPrompt";
import type { MINI_APP_CATEGORIES, MINI_APP_PERMISSIONS } from "../ai/manifest";

export type TemplateGroup = "verein" | "betrieb" | "gemeinde" | "veranstaltung" | "mitmachen";

export const TEMPLATE_GROUPS: { id: TemplateGroup; label: string }[] = [
  { id: "verein", label: "Verein" },
  { id: "betrieb", label: "Betrieb" },
  { id: "gemeinde", label: "Gemeinde" },
  { id: "veranstaltung", label: "Veranstaltung" },
  { id: "mitmachen", label: "Mitmachen" },
];

export interface TemplateCmsKey {
  key: string;
  beschreibung: string;
  /** Initial content, seeded on the first publish (same shape as the editor's CmsKeyPlan). */
  beispiel: unknown;
}

export interface MiniAppTemplate {
  id: string;
  title: string;
  /** One or two German sentences for the gallery card. */
  summary: string;
  group: TemplateGroup;
  recommended?: boolean;
  /** Manifest draft the editor pre-fills (name, category, permissions). */
  manifest: {
    name: string;
    description: string;
    category: (typeof MINI_APP_CATEGORIES)[number];
    tags: string[];
    permissions: (typeof MINI_APP_PERMISSIONS)[number][];
  };
  cms: TemplateCmsKey[];
  /** Ideas shown as chips after loading ("what could I change?"). */
  suggestions: string[];
  /** Gallery illustration, inline SVG (viewBox 0 0 320 180). */
  thumbnailSvg: string;
  html: string;
}

/** Assembles a complete app document from the shared boilerplate. */
export function templateDocument(opts: { title: string; body: string; script: string; notes: string }): string {
  return `${BOILERPLATE.replace("{APP_NAME}", opts.title)}
<body class="min-h-screen bg-background">
${opts.body.trim()}
<script type="module">
import { sdk } from "${SDK_ESM_URL}";
${opts.script.trim()}
</script>
</body>
</html>
<!--NOTES: ${opts.notes}-->`;
}

/** Shared tiny helpers injected into every template script (screen switching, escaping). */
export const SCRIPT_HELPERS = `
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pv = window.__NETIZEN_PREVIEW_STATE__;
function showScreen(name) {
  document.querySelectorAll("main > section[data-screen]").forEach((s) => s.classList.toggle("active", s.dataset.screen === name));
  document.querySelectorAll("[data-goto]").forEach((b) => {
    const on = b.dataset.goto === name;
    b.classList.toggle("text-primary", on);
    b.classList.toggle("text-muted-foreground", !on);
  });
  sdk.track("screen_view", { screen: name });
  window.scrollTo(0, 0);
}
document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => showScreen(b.dataset.goto)));
async function content(key, fallback) {
  try { const r = await sdk.data.get(key); if (r.exists && r.value != null) return r.value; } catch {}
  return fallback;
}
async function userState(key, fallback) {
  try { const r = await sdk.data.getUser(key); if (r.exists && r.value != null) return r.value; } catch {}
  return fallback;
}
async function saveUser(key, value) {
  try { await sdk.data.setUser(key, value); } catch {}
}
`;

/** Bottom navigation for 2–4 screens. */
export function bottomNav(items: { screen: string; label: string }[], active: string): string {
  const buttons = items
    .map(
      (i) =>
        `<button data-goto="${i.screen}" class="flex-1 px-3 py-3 text-xs font-medium ${i.screen === active ? "text-primary" : "text-muted-foreground"}">${i.label}</button>`,
    )
    .join("\n      ");
  return `<nav class="pb-safe fixed inset-x-0 bottom-0 border-t border-border bg-card">
    <div class="mx-auto flex max-w-md">
      ${buttons}
    </div>
  </nav>`;
}
