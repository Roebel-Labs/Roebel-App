"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useActiveAccount } from "thirdweb/react";
import { createClient } from "@/lib/supabase/client";
import { getPostsForFeed } from "@/app/actions/posts";
import { PostComposer } from "@/components/app/PostComposer";
import { PostCard } from "@/components/app/PostCard";
import { AlertCard } from "@/components/app/AlertCard";
import type { ServiceAlert } from "@/app/actions/alerts";
import type { PostWithEngagement } from "@/types/post";
import { useAppMode } from "@/lib/context/AppModeContext";
import { Landmark, Vote, ArrowRight, ShieldCheck } from "lucide-react";

interface RathausProposal {
  id: string;
  title: string;
  status: string;
  created_at: string;
  vote_count?: number;
}

export function RathausFeed() {
  const account = useActiveAccount();
  const { activeMode } = useAppMode();
  const [posts, setPosts] = useState<PostWithEngagement[]>([]);
  const [proposals, setProposals] = useState<RathausProposal[]>([]);
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const [announcements, setAnnouncements] = useState<{ id: string; title: string; content: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const canPost = activeMode === "citizen" || activeMode === "org";

  const handlePostCreated = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handlePostDeleted = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    async function fetchRathaus() {
      setLoading(true);
      const supabase = createClient();

      const [alertsRes, postsResult, proposalsRes, announcementsRes] = await Promise.all([
        supabase
          .from("service_alerts")
          .select("*")
          .eq("status", "active")
          .order("severity", { ascending: true })
          .limit(3),
        getPostsForFeed(15, 0, account?.address, "rathaus"),
        supabase
          .from("proposals")
          .select("id, title, status, created_at")
          .in("status", ["active", "pending"])
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("announcements")
          .select("id, title, content, created_at")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      setAlerts((alertsRes.data || []) as ServiceAlert[]);
      if (postsResult.success && postsResult.data) {
        setPosts(postsResult.data);
      }
      setProposals((proposalsRes.data || []) as RathausProposal[]);
      setAnnouncements(announcementsRes.data || []);
      setLoading(false);
    }
    fetchRathaus();
  }, [refreshKey, account?.address]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card rounded-lg border border-border animate-pulse h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tourist CTA */}
      {activeMode === "tourist" && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Werde Bürger, um im Rathaus teilzunehmen
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Verifizierte Bürger und Organisationen können im Rathaus posten und abstimmen.
            </p>
            <Link
              href="/app/verifizierung"
              className="text-xs text-primary font-medium mt-2 inline-block hover:underline"
            >
              Jetzt verifizieren
            </Link>
          </div>
        </div>
      )}

      {/* Post composer — citizens and orgs only */}
      {canPost && <PostComposer onPostCreated={handlePostCreated} />}

      {/* Active alerts */}
      {alerts.map((alert) => (
        <AlertCard key={`alert-${alert.id}`} {...alert} />
      ))}

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <Landmark className="h-4 w-4 text-primary" />
            Bekanntmachungen
          </h3>
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="border-l-2 border-primary/30 pl-3">
                <p className="text-sm font-medium text-foreground">{a.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.content}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(a.created_at).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active proposals */}
      {proposals.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Vote className="h-4 w-4 text-primary" />
              Aktive Abstimmungen
            </h3>
            <Link
              href="/app/proposals"
              className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
            >
              Alle <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {proposals.map((p) => (
              <Link
                key={p.id}
                href={`/app/proposals/${p.id}`}
                className="block p-3 rounded-md border border-border hover:bg-accent transition-colors"
              >
                <p className="text-sm font-medium text-foreground line-clamp-1">{p.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.status === "active"
                      ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                      : "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
                  }`}>
                    {p.status === "active" ? "Aktiv" : "Ausstehend"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Civic posts */}
      {posts.length > 0 ? (
        posts.map((post) => (
          <PostCard key={`post-${post.id}`} {...post} onDeleted={handlePostDeleted} />
        ))
      ) : (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <Landmark className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">
            Noch keine Beiträge im Rathaus. {canPost ? "Sei der Erste!" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
