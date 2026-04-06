import dynamic from "next/dynamic"
import { EventsHeader } from "@/components/events/events-header"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"

// EventSubmissionForm uses useAccount() which requires AccountProvider (only in /app/app layout)
const EventSubmissionForm = dynamic(
  () => import("@/components/events/event-submission-form").then(m => m.EventSubmissionForm),
  { ssr: false }
)

export default function SubmitEventPage() {
  return (
    <div className="min-h-screen bg-background">
      <EventsHeader />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-medium text-foreground mb-4 text-balance">Reichen Sie Ihre Veranstaltung ein.</h1>
            <p className="text-lg text-muted-foreground text-pretty">
            Teilen Sie Ihre Veranstaltung mit der Community. Alle Einsendungen werden vor der Veröffentlichung geprüft.
            </p>

            {/* AI submission option */}
            <div className="mt-6">
              <Link href="/submit-ai">
                <Button variant="outline" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Probiere die KI-gestützte Einreichung
                </Button>
              </Link>
            </div>
          </div>
          <EventSubmissionForm />
        </div>
      </main>
    </div>
  )
}
