import SubmitPageClient from "./SubmitPageClient"

// Prevent static prerendering — EventSubmissionForm uses useAccount context
export const dynamic = "force-dynamic";

export default function SubmitEventPage() {
  return <SubmitPageClient />
}
