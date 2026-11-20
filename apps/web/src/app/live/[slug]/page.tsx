import type { Metadata } from "next";
import { supabase, hasSupabase } from "@/lib/supabase";
import { LiveLanding } from "@/components/live/live-landing";

export const dynamic = "force-dynamic";

async function loadTitle(slug: string): Promise<{ title: string; subtitle: string | null; poster: string | null } | null> {
  if (!hasSupabase) return null;
  try {
    const { data } = await supabase
      .from("live_shows")
      .select("title, subtitle, poster_url")
      .eq("slug", slug)
      .maybeSingle();
    return data ? { title: data.title as string, subtitle: (data.subtitle as string | null) ?? null, poster: (data.poster_url as string | null) ?? null } : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const show = await loadTitle(slug);
  const title = show ? `${show.title} · Live in der Röbel App` : "Live in der Röbel App";
  const description = show?.subtitle ?? "Schau live in der Röbel App – mit Chat, Reaktionen und Publikumsliebling.";
  return {
    title,
    description,
    openGraph: { title, description, images: show?.poster ? [show.poster] : undefined },
  };
}

export default async function LivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const show = await loadTitle(slug);
  return <LiveLanding slug={slug} initialTitle={show?.title ?? null} />;
}
