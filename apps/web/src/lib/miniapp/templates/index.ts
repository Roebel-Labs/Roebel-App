// Template catalogue. Order = gallery order (recommended first).
import { buergerinfo } from "./buergerinfo";
import { festprogramm } from "./festprogramm";
import { quiz } from "./quiz";
import { vereinstermine } from "./vereinstermine";
import { wochenkarte } from "./wochenkarte";
import { TEMPLATE_GROUPS, type MiniAppTemplate } from "./types";

export { TEMPLATE_GROUPS };
export type { MiniAppTemplate, TemplateGroup, TemplateCmsKey } from "./types";

export const MINI_APP_TEMPLATES: MiniAppTemplate[] = [vereinstermine, wochenkarte, quiz, festprogramm, buergerinfo];

export function getTemplate(id: string): MiniAppTemplate | null {
  return MINI_APP_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Gallery entry without the (large) HTML. */
export type TemplateSummary = Omit<MiniAppTemplate, "html" | "cms"> & { cmsKeys: string[] };

export function templateSummary(t: MiniAppTemplate): TemplateSummary {
  const { html: _html, cms, ...rest } = t;
  return { ...rest, cmsKeys: cms.map((c) => c.key) };
}
