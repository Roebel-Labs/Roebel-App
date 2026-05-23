"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getStoryCollectionById,
  type StoryCollectionWithSlides,
} from "@/lib/supabase-story-collections";
import { Skeleton } from "@/components/ui/skeleton";
import { StoryCollectionForm } from "../../_components/StoryCollectionForm";

export default function EditStoryCollectionPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [collection, setCollection] = useState<StoryCollectionWithSlides | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getStoryCollectionById(id).then((c) => {
      if (cancelled) return;
      setCollection(c);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="bg-card border border-border rounded-[10px] p-6 text-sm">
        Sammlung nicht gefunden.
      </div>
    );
  }

  return <StoryCollectionForm mode="edit" existing={collection} />;
}
