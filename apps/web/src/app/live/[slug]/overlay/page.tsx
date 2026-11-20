import { LiveOverlay } from "@/components/live/overlay/live-overlay";

export const dynamic = "force-dynamic";

// OBS browser source, 1920×1080:  https://www.roebel.app/live/<slug>/overlay
//   ?preview=1     dummy data on a checkerboard (design check in a normal browser)
//   ?preview=live  real data on a checkerboard
export default async function LiveOverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const mode = preview === "live" ? "checker" : preview ? "preview" : "live";
  return <LiveOverlay slug={slug} mode={mode} />;
}
