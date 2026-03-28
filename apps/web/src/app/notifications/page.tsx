import { getUnifiedNotifications } from "@/app/actions/app-notifications"
import { NotificationsList } from "@/components/notifications/NotificationsList"

export const dynamic = "force-dynamic"

export default async function NotificationsPage() {
  const result = await getUnifiedNotifications({ limit: 30 })

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-4xl font-medium text-foreground">Benachrichtigungen</h1>
          <p className="text-muted-foreground mt-2">
            Alle deine Benachrichtigungen
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <NotificationsList
          initialNotifications={result.data || []}
          initialTotal={result.total || 0}
        />
      </main>
    </div>
  )
}
