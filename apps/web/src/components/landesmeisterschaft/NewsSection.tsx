"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface NewsArticle {
  id: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  slug: string;
}

// Static fallback data when no Supabase articles are available
const staticNewsItems: NewsArticle[] = [
  {
    id: "static-1",
    title: "Neue Updates zum Livestream",
    excerpt:
      "Alle wichtigen Informationen zur Übertragung der Landesmeisterschaft.",
    cover_image_url: "/psv/desktop-bg.png",
    slug: "",
  },
  {
    id: "static-2",
    title: "Kämpfer im Fokus",
    excerpt:
      "Lernen Sie die Teilnehmer der diesjährigen Meisterschaft kennen.",
    cover_image_url: "/psv/desktop-bg.png",
    slug: "",
  },
  {
    id: "static-3",
    title: "Zeitplan veröffentlicht",
    excerpt:
      "Der komplette Ablaufplan für alle Gewichtsklassen ist jetzt verfügbar.",
    cover_image_url: "/psv/desktop-bg.png",
    slug: "",
  },
];

export function NewsSection() {
  const [articles, setArticles] = useState<NewsArticle[]>(staticNewsItems);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBoxenNews() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("news_articles")
          .select("id, title, excerpt, cover_image_url, slug")
          .ilike("category", "boxen")
          .eq("status", "published")
          .order("published_at", { ascending: false });

        if (error) {
          console.error("Error fetching Boxen news:", error);
          return;
        }

        if (data && data.length > 0) {
          setArticles(data);
        }
      } catch (err) {
        console.error("Failed to fetch news:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchBoxenNews();
  }, []);

  return (
    <section className="relative overflow-hidden bg-gray-100 py-12 md:py-24">
      {/* Background Image */}
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/psv/bg-news.png"
          alt=""
          fill
          className="object-cover"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 md:px-12 lg:px-20">
        {/* Section Header */}
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 md:text-3xl">
            Neuigkeiten
          </h2>
          <p className="mt-2 text-sm text-gray-600 md:text-sm">
            Das gesamte Event live online und von überall mitverfolgen und
            mitfiebern.
          </p>
        </div>

        {/* News Cards - Horizontal scroll on mobile, grid on desktop */}
        <div className="-mx-6 mt-8 flex gap-4 overflow-x-auto px-6 pb-4 snap-x snap-mandatory scrollbar-hide md:mx-0 md:mt-10 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 md:pb-0">
          {articles.map((article) => {
            const hasLink = article.slug && article.slug.length > 0;

            const cardContent = (
              <article className="group relative overflow-hidden rounded-xl bg-gray-800 cursor-pointer md:rounded-2xl">
                {/* Image - Taller aspect ratio */}
                <div className="relative aspect-[3/4] overflow-hidden">
                  <Image
                    src="/psv/news-thumbnail.jpg"
                    alt={article.title}
                    fill
                    className="object-cover object-center transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />
                </div>

                {/* Content */}
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 text-center">
                  <h3 className="text-base font-bold text-white md:text-xl">
                    {article.title}
                  </h3>
                </div>
              </article>
            );

            const wrapperClasses =
              "snap-center flex-shrink-0 w-[240px] md:w-auto";

            if (hasLink) {
              return (
                <Link
                  key={article.id}
                  href={`/news/${article.slug}`}
                  className={wrapperClasses}
                >
                  {cardContent}
                </Link>
              );
            }

            return (
              <div key={article.id} className={wrapperClasses}>
                {cardContent}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hide scrollbar CSS */}
      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </section>
  );
}
