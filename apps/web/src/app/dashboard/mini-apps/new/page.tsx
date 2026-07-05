import { redirect } from "next/navigation";

// The AI editor moved to the external /editor page (2026-07). Keep old links
// (bookmarks, printed material, in-app references) working.
export default async function LegacyNewMiniApp({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  const qs = params.toString();
  redirect(qs ? `/editor?${qs}` : "/editor");
}
