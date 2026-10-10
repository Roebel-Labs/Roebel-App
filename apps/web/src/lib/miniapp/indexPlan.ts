// apps/web/src/lib/miniapp/indexPlan.ts
// Pure decision logic for (re-)indexing a self-hosted manifest (spec §5).
// The executor in indexing.ts applies the plan; keeping the branching here
// makes every transition unit-testable.
import { slugify, type ParsedManifestFile } from "./manifestFile";
import { MiniAppError, type MiniAppStatus } from "./types";

export interface ExistingIndexedApp {
  id: string;
  slug: string;
  status: MiniAppStatus;
  ownerWallet: string | null;
  latestHash: string | null;
}

export type IndexPlan =
  | { kind: "create"; slug: string }
  | { kind: "touch" }
  | { kind: "update-direct" }
  | { kind: "stage-version"; markPendingUpdate: boolean };

export function pickSlug(parsed: ParsedManifestFile, isTaken: (slug: string) => boolean): string {
  if (parsed.slugExplicit) {
    if (isTaken(parsed.manifest.slug)) {
      throw new MiniAppError("conflict", `Der slug "${parsed.manifest.slug}" ist bereits vergeben.`);
    }
    return parsed.manifest.slug;
  }
  const base = slugify(parsed.manifest.name).slice(0, 57).replace(/-+$/, "");
  for (let n = 1; n <= 9; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!isTaken(candidate)) return candidate;
  }
  throw new MiniAppError("conflict", `Kein freier slug für "${parsed.manifest.name}" — setze miniapp.slug selbst.`);
}

export function planIndex(
  existing: ExistingIndexedApp | null,
  parsed: ParsedManifestFile,
  hash: string,
  slug?: string,
): IndexPlan {
  if (!existing) {
    if (!slug) throw new MiniAppError("internal", "planIndex: slug required for new apps.");
    return { kind: "create", slug };
  }
  if (existing.ownerWallet && existing.ownerWallet !== parsed.owner) {
    throw new MiniAppError(
      "conflict",
      "Diese Domain ist bereits einem anderen Besitzer zugeordnet. Melde dich beim Röbel-Team, um den Besitzer zu ändern.",
    );
  }
  if (existing.latestHash === hash) return { kind: "touch" };
  if (existing.status === "live") return { kind: "stage-version", markPendingUpdate: true };
  if (existing.status === "suspended") {
    return { kind: "stage-version", markPendingUpdate: false };
  }
  return { kind: "update-direct" };
}
