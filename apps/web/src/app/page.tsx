import { createClient } from "@/lib/supabase/server"
import { EventsHeader } from "@/components/events/events-header"
import { EventsHero } from "@/components/events/events-hero"
import { EventsPage } from "@/components/events/events-page"
import { NewsCarousel } from "@/components/news/news-carousel"
import { FeedProposalHero } from "@/components/proposals/FeedProposalHero"
import { getProposals } from "@/lib/supabase"
import { ProposalState } from "@/lib/proposal-types"

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const supabase = await createClient()

  // Fetch events
  let query = supabase.from("events").select("*").eq("status", "approved").order("date", { ascending: true })

  if (resolvedSearchParams.category && resolvedSearchParams.category !== "All Events") {
    query = query.eq("category", resolvedSearchParams.category)
  }

  if (resolvedSearchParams.search) {
    query = query.or(`title.ilike.%${resolvedSearchParams.search}%,description.ilike.%${resolvedSearchParams.search}%`)
  }

  const { data: events, error } = await query

  if (error) {
    console.error("Error fetching events:", error)
  }

  // Fetch latest news articles
  const { data: newsArticles, error: newsError } = await supabase
    .from("news_articles")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(6)

  if (newsError) {
    console.error("Error fetching news:", newsError)
  }

  // Feature the open proposal (active one, else the newest) above the feed.
  const proposalsResult = await getProposals({
    orderBy: "created_at",
    orderDirection: "desc",
    limit: 10,
  })
  const proposals = proposalsResult.data?.proposals ?? []
  const featuredProposal =
    proposals.find((p) => p.state === ProposalState.Active) ?? proposals[0] ?? null

  return (
    <div className="min-h-screen bg-background">
        <EventsHeader />
        <EventsHero />
        {featuredProposal && (
          <section className="container mx-auto px-4 pt-6 md:px-6">
            <FeedProposalHero proposal={featuredProposal} />
          </section>
        )}
        <EventsPage
          initialEvents={events || []}
          initialCategory={resolvedSearchParams.category || "All Events"}
        />
        <NewsCarousel articles={newsArticles || []} />
    </div>
  )
}
