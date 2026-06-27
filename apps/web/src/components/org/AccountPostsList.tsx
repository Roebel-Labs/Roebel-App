"use client";

import { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { PostCard } from "@/components/app/PostCard";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAccountPosts } from "@/lib/supabase-org-content";
import type { PostWithEngagement } from "@/types/post";

interface AccountPostsListProps {
  accountId: string;
}

export function AccountPostsList({ accountId }: AccountPostsListProps) {
  const account = useActiveAccount();
  const wallet = account?.address ?? null;
  const [posts, setPosts] = useState<PostWithEngagement[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchAccountPosts(accountId, {
        pageSize: 50,
        viewerWallet: wallet,
      });
      if (!cancelled) setPosts(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, wallet]);

  if (posts === null) {
    return (
      <div className="space-y-4 py-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Noch keine Beiträge.
      </p>
    );
  }

  return (
    <div className="space-y-4 py-4">
      {posts.map((p) => (
        <PostCard
          key={p.id}
          {...p}
          onDeleted={() =>
            setPosts((prev) => prev?.filter((x) => x.id !== p.id) ?? null)
          }
        />
      ))}
    </div>
  );
}
