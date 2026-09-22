import { PosterReview } from "../_components/PosterReview";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export default async function PosterReviewPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <PosterReview eventId={eventId} />;
}
