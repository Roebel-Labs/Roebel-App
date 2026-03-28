"use client";

import { useSearchParams } from "next/navigation";
import { MessagesLayout } from "@/components/messages/MessagesLayout";

export default function MessagesPage() {
  const searchParams = useSearchParams();
  const to = searchParams.get("to");
  const subject = searchParams.get("subject");
  const listingId = searchParams.get("listingId");

  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100dvh-5.5rem)] flex flex-col">
      <MessagesLayout initialTo={to} initialSubject={subject} initialListingId={listingId} />
    </div>
  );
}
