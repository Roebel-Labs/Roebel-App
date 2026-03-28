import { getUnifiedNotifications } from "@/app/actions/app-notifications"
import { NotificationsList } from "@/components/notifications/NotificationsList"

export const dynamic = "force-dynamic"

export default async function NotificationsPage() {
  const result = await getUnifiedNotifications({ limit: 30 })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Benachrichtigungen</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Alle deine Benachrichtigungen
        </p>
      </div>

      <NotificationsList
        initialNotifications={result.data || []}
        initialTotal={result.total || 0}
      />
    </div>
  )
}
