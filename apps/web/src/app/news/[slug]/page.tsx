import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, User, Eye, ArrowLeft, Share2 } from "lucide-react"
import Link from "next/link"
import { EventsHeader } from "@/components/events/events-header"
import { DeepLinkRedirect } from "@/components/deep-link-redirect"

export const dynamic = "force-dynamic"

interface NewsArticlePageProps {
  params: Promise<{ slug: string }>
}

export default async function NewsArticlePage({ params }: NewsArticlePageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: article, error } = await supabase
    .from("news_articles")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single()

  if (error || !article) {
    notFound()
  }

  // Increment view count
  await supabase
    .from("news_articles")
    .update({ view_count: article.view_count + 1 })
    .eq("id", article.id)

  return (
    <div className="min-h-screen bg-background">
      <DeepLinkRedirect type="news" id={slug} />
      <EventsHeader />

      <main className="container mx-auto px-4 py-4 md:py-8">
        <div className="mb-4 md:mb-6">
          <Button variant="ghost" asChild className="gap-2 px-0 hover:bg-transparent text-sm md:text-base">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Zurück zur Startseite
            </Link>
          </Button>
        </div>
        <article className="max-w-4xl mx-auto">
          {/* Article Header */}
          <div className="mb-6 md:mb-8">
            <div className="flex items-center gap-2 mb-3 md:mb-4 flex-wrap">
              {article.category && (
                <Badge variant="secondary" className="text-xs">{article.category}</Badge>
              )}
              {article.is_featured && (
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">
                  Featured
                </Badge>
              )}
              {article.tags && article.tags.length > 0 && (
                article.tags.slice(0, 3).map((tag: string) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))
              )}
            </div>

            <h1 className="text-2xl md:text-4xl lg:text-5xl font-medium text-foreground mb-3 md:mb-4">
              {article.title}
            </h1>

            {article.excerpt && (
              <p className="text-base md:text-xl text-muted-foreground mb-4 md:mb-6">{article.excerpt}</p>
            )}

            <div className="flex items-center justify-between flex-wrap gap-3 md:gap-4 text-xs md:text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-3 md:gap-4">
                <span className="flex items-center gap-1.5 md:gap-2">
                  <User className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  <span className="truncate max-w-[120px] md:max-w-none">{article.author_name}</span>
                </span>
                <span className="flex items-center gap-1.5 md:gap-2">
                  <Calendar className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  {new Date(article.published_at).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="flex items-center gap-1.5 md:gap-2">
                  <Eye className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  {article.view_count + 1}
                </span>
              </div>

              <Button variant="outline" size="sm" className="text-xs md:text-sm h-8 md:h-9">
                <Share2 className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                Teilen
              </Button>
            </div>
          </div>

          {/* Cover Image */}
          {article.cover_image_url && (
            <div className="mb-6 md:mb-8 rounded-[10px] overflow-hidden aspect-video bg-muted">
              <img
                src={article.cover_image_url}
                alt={article.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Article Content */}
          <div
            className="article-content"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />

          {/* Article Footer */}
          <div className="mt-8 md:mt-12 pt-6 md:pt-8 border-t border-border">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs md:text-sm text-muted-foreground">Veröffentlicht am</p>
                <p className="font-medium text-sm md:text-base">
                  {new Date(article.published_at).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <Link href="/news">
                <Button variant="outline" className="text-sm md:text-base h-9 md:h-10">
                  Weitere Artikel lesen
                </Button>
              </Link>
            </div>
          </div>
        </article>
      </main>
    </div>
  )
}
