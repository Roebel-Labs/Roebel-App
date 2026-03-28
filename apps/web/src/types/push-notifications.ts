// Push token stored for each device
export interface PushToken {
  id: string
  device_id: string
  expo_push_token: string
  platform: "ios" | "android" | null
  app_version: string | null
  is_active: boolean
  last_used_at: string
  created_at: string
}

// User notification preferences per device
export interface NotificationPreference {
  id: string
  device_id: string
  events_enabled: boolean
  event_categories: string[]
  news_enabled: boolean
  news_breaking: boolean
  news_featured: boolean
  created_at: string
  updated_at: string
}

// Delivery status from Expo Push Receipts
export interface DeliveryStatus {
  delivered: number
  failed: number
  total: number
  last_checked: string
}

// Notification log entry
export interface NotificationLogEntry {
  id: string
  notification_type: string
  title: string
  body: string
  data: Record<string, unknown> | null
  tokens_sent: number
  tokens_failed: number
  status: "pending" | "sent" | "partial" | "failed"
  created_at: string
  expo_ticket_ids?: string[]
  delivery_status?: DeliveryStatus | null
}

// Stats for the dashboard
export interface PushNotificationStats {
  totalDevices: number
  activeDevices: number
  iosDevices: number
  androidDevices: number
  sentToday: number
  failedToday: number
  eventsEnabled: number
  newsEnabled: number
}

// Payload for sending a notification
export interface SendNotificationPayload {
  type: "broadcast" | "category" | "test"
  title: string
  body: string
  categories?: string[]
  testToken?: string
  data?:
    | { type: "event"; eventId: string }
    | { type: "news"; slug: string }
}

// Filter options for notification log
export interface NotificationLogFilter {
  type?: string
  status?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

// Filter options for devices
export interface DeviceFilter {
  platform?: "ios" | "android"
  isActive?: boolean
  search?: string
  limit?: number
  offset?: number
}
