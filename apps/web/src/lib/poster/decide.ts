// Which pipeline an event image needs. Spec §4: skip only a clean A-format
// poster with the event information; reformat any poster with information;
// design everything else (logos, photos, graphics, drafts without image).
import type { RatioClass } from "./ratio";
import type { PosterAnalysis, PosterMode } from "./types";

export function decideMode(
  ratio: RatioClass | null,
  analysis: PosterAnalysis | null,
): PosterMode | "skip" {
  if (!analysis || ratio === null) return "design";
  const posterLike = analysis.kind === "poster" || analysis.kind === "screenshot";
  if (posterLike && analysis.hasEventInfo) {
    const clean =
      ratio === "ok" && analysis.kind === "poster" && !analysis.hasUiChrome && analysis.quality === "ok";
    return clean ? "skip" : "reformat";
  }
  return "design";
}
