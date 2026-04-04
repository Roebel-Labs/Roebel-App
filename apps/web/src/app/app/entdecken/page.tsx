"use client";

import { useState, useEffect } from "react";
import { useActiveAccount } from "thirdweb/react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import Link from "next/link";
import {
  Compass,
  Award,
  MapPin,
  Star,
  CheckCircle,
  Lock,
} from "lucide-react";

interface Checkpoint {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  points_reward: number;
  badge_image_url: string | null;
  category: string | null;
  is_completed: boolean;
  completed_at: string | null;
}

export default function EntdeckenPage() {
  const account = useActiveAccount();
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCheckpoints() {
      setLoading(true);
      const supabase = createClient();

      // Fetch all active checkpoints
      const { data: cpData } = await supabase
        .from("explorer_checkpoints")
        .select("*")
        .eq("is_active", true)
        .order("category", { ascending: true });

      // Fetch user's completions
      let completionIds = new Set<string>();
      let completionDates = new Map<string, string>();
      if (account?.address) {
        const { data: completions } = await supabase
          .from("explorer_completions")
          .select("checkpoint_id, completed_at")
          .eq("wallet_address", account.address);

        if (completions) {
          completionIds = new Set(completions.map((c) => c.checkpoint_id));
          completions.forEach((c) => completionDates.set(c.checkpoint_id, c.completed_at));
        }
      }

      const mapped: Checkpoint[] = (cpData || []).map((cp) => ({
        id: cp.id,
        name: cp.name,
        description: cp.description,
        latitude: Number(cp.latitude),
        longitude: Number(cp.longitude),
        points_reward: cp.points_reward,
        badge_image_url: cp.badge_image_url,
        category: cp.category,
        is_completed: completionIds.has(cp.id),
        completed_at: completionDates.get(cp.id) || null,
      }));

      setCheckpoints(mapped);
      setLoading(false);
    }
    fetchCheckpoints();
  }, [account?.address]);

  const completedCount = checkpoints.filter((c) => c.is_completed).length;
  const totalCount = checkpoints.length;
  const totalPoints = checkpoints.reduce((sum, c) => sum + c.points_reward, 0);
  const earnedPoints = checkpoints
    .filter((c) => c.is_completed)
    .reduce((sum, c) => sum + c.points_reward, 0);

  // Group by category
  const categories = Array.from(new Set(checkpoints.map((c) => c.category || "Sonstiges")));

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-40 bg-muted rounded-lg animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header card */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-2 mb-4">
          <Compass className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Röbel Explorer</h1>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold">
              {completedCount}/{totalCount}
            </p>
            <p className="text-sm text-white/70">Checkpoints besucht</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{earnedPoints}</p>
            <p className="text-sm text-white/70">von {totalPoints} Punkten</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* Map link */}
      <Link
        href="/app/karte"
        className="flex items-center gap-3 p-4 bg-card border border-border rounded-lg hover:bg-accent transition-colors"
      >
        <MapPin className="h-5 w-5 text-primary" />
        <div>
          <p className="text-sm font-medium text-foreground">Auf der Karte anzeigen</p>
          <p className="text-xs text-muted-foreground">Alle Checkpoints auf der Karte sehen</p>
        </div>
      </Link>

      {/* Checkpoints by category */}
      {categories.map((category) => {
        const categoryCheckpoints = checkpoints.filter(
          (c) => (c.category || "Sonstiges") === category
        );
        const categoryCompleted = categoryCheckpoints.filter((c) => c.is_completed).length;

        return (
          <div key={category} className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">{category}</h2>
              <span className="text-xs text-muted-foreground">
                {categoryCompleted}/{categoryCheckpoints.length}
              </span>
            </div>
            <div className="divide-y divide-border">
              {categoryCheckpoints.map((cp) => (
                <div
                  key={cp.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    cp.is_completed ? "bg-green-50/50 dark:bg-green-950/20" : ""
                  }`}
                >
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 ${
                      cp.is_completed
                        ? "bg-green-100 dark:bg-green-900"
                        : "bg-amber-100 dark:bg-amber-900"
                    }`}
                  >
                    {cp.is_completed ? (
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Compass className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${
                      cp.is_completed ? "text-foreground" : "text-foreground"
                    }`}>
                      {cp.name}
                    </p>
                    {cp.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {cp.description}
                      </p>
                    )}
                    {cp.is_completed && cp.completed_at && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                        Besucht am {new Date(cp.completed_at).toLocaleDateString("de-DE", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      cp.is_completed
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {cp.is_completed ? "✓" : `+${cp.points_reward}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
