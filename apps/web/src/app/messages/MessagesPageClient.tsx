"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { MessagesLayout } from "@/components/messages/MessagesLayout";

function MessagesContent() {
  const searchParams = useSearchParams();
  const to = searchParams.get("to");
  const subject = searchParams.get("subject");

  return <MessagesLayout initialTo={to} initialSubject={subject} />;
}

export default function MessagesPageClient() {
  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" /></div>}>
          <MessagesContent />
        </Suspense>
      </div>
    </div>
  );
}
