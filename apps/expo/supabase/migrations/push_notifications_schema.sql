-- Push Notifications Schema for Röbel App
-- Run this in your Supabase SQL Editor to set up the notification tables
--
-- Prerequisites:
-- 1. Set up FCM credentials in Firebase Console
-- 2. Set up APNs key in Apple Developer Portal
-- 3. Upload credentials to Expo via: eas credentials

-- =============================================================================
-- TABLE 1: push_tokens
-- Stores device push tokens linked to device IDs
-- =============================================================================

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  expo_push_token TEXT NOT NULL UNIQUE,
  platform TEXT CHECK (platform IN ('ios', 'android')),
  app_version TEXT,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups of active tokens
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active) WHERE is_active = true;

-- Index for device_id lookups
CREATE INDEX IF NOT EXISTS idx_push_tokens_device_id ON push_tokens(device_id);

COMMENT ON TABLE push_tokens IS 'Stores Expo push tokens for registered devices';
COMMENT ON COLUMN push_tokens.device_id IS 'Unique device identifier generated on client';
COMMENT ON COLUMN push_tokens.expo_push_token IS 'Expo push token (ExponentPushToken[...])';
COMMENT ON COLUMN push_tokens.platform IS 'Device platform (ios or android)';
COMMENT ON COLUMN push_tokens.is_active IS 'False if token is invalid or user disabled notifications';

-- =============================================================================
-- TABLE 2: notification_preferences
-- Stores user notification preferences per device
-- =============================================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE REFERENCES push_tokens(device_id) ON DELETE CASCADE,

  -- Event notifications
  events_enabled BOOLEAN DEFAULT true,
  event_categories TEXT[] DEFAULT ARRAY['Kultur', 'Musik', 'Essen & Trinken',
    'Kirchliches', 'Ausstellungen', 'Stadt', 'Sport', 'Sonstige'],

  -- News notifications
  news_enabled BOOLEAN DEFAULT true,
  news_breaking BOOLEAN DEFAULT true,
  news_featured BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for device_id lookups
CREATE INDEX IF NOT EXISTS idx_notification_preferences_device_id ON notification_preferences(device_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();

COMMENT ON TABLE notification_preferences IS 'User notification preferences per device';
COMMENT ON COLUMN notification_preferences.events_enabled IS 'Master toggle for event notifications';
COMMENT ON COLUMN notification_preferences.event_categories IS 'Array of categories to receive notifications for';
COMMENT ON COLUMN notification_preferences.news_breaking IS 'Receive breaking news notifications';
COMMENT ON COLUMN notification_preferences.news_featured IS 'Receive featured article notifications';

-- =============================================================================
-- TABLE 3: notification_log
-- Audit trail for sent notifications
-- =============================================================================

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  tokens_sent INTEGER DEFAULT 0,
  tokens_failed INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'partial', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_notification_log_type ON notification_log(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at DESC);

COMMENT ON TABLE notification_log IS 'Audit log for all sent push notifications';
COMMENT ON COLUMN notification_log.notification_type IS 'Type: event_new, news_breaking, news_featured';
COMMENT ON COLUMN notification_log.status IS 'Delivery status: pending, sent, partial, failed';

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- push_tokens: Allow insert/update from anon (client app)
-- Using anon key since users are not authenticated
CREATE POLICY "Allow anon to insert push tokens"
  ON push_tokens FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon to update own push tokens"
  ON push_tokens FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon to select push tokens"
  ON push_tokens FOR SELECT
  TO anon
  USING (true);

-- notification_preferences: Allow CRUD from anon
CREATE POLICY "Allow anon to manage notification preferences"
  ON notification_preferences FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- notification_log: Service role only (for Edge Functions)
CREATE POLICY "Service role can manage notification logs"
  ON notification_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow anon to read notification logs (for debugging/analytics)
CREATE POLICY "Allow anon to read notification logs"
  ON notification_log FOR SELECT
  TO anon
  USING (true);

-- =============================================================================
-- DATABASE WEBHOOKS FOR AUTOMATIC NOTIFICATIONS
-- =============================================================================

-- These require the pg_net extension and Edge Function deployment
-- Enable pg_net if not already enabled:
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- Example trigger for new approved events:
-- (Uncomment after deploying the Edge Function and setting up secrets)

/*
CREATE OR REPLACE FUNCTION notify_new_event()
RETURNS TRIGGER AS $$
DECLARE
  edge_function_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Only trigger when status changes to 'approved'
  IF NEW.status = 'approved' AND (OLD IS NULL OR OLD.status != 'approved') THEN
    edge_function_url := current_setting('app.settings.edge_function_url', true);
    service_role_key := current_setting('app.settings.service_role_key', true);

    IF edge_function_url IS NOT NULL AND service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := edge_function_url || '/send-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object(
          'type', 'event_new',
          'title', 'Neue Veranstaltung: ' || NEW.title,
          'body', COALESCE(LEFT(NEW.description, 100), 'Entdecken Sie diese neue Veranstaltung'),
          'category', NEW.category,
          'data', jsonb_build_object('eventId', NEW.id::text, 'type', 'event')
        )::text
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_event_approved ON events;
CREATE TRIGGER on_event_approved
  AFTER INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_event();
*/

-- Example trigger for breaking news:
/*
CREATE OR REPLACE FUNCTION notify_breaking_news()
RETURNS TRIGGER AS $$
DECLARE
  edge_function_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Only trigger for breaking news
  IF NEW.is_breaking = true AND NEW.status = 'published' THEN
    edge_function_url := current_setting('app.settings.edge_function_url', true);
    service_role_key := current_setting('app.settings.service_role_key', true);

    IF edge_function_url IS NOT NULL AND service_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := edge_function_url || '/send-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object(
          'type', 'news_breaking',
          'title', 'Eilmeldung: ' || NEW.title,
          'body', COALESCE(NEW.excerpt, LEFT(NEW.content, 100)),
          'data', jsonb_build_object('slug', NEW.slug, 'type', 'news')
        )::text
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_breaking_news ON news;
CREATE TRIGGER on_breaking_news
  AFTER INSERT ON news
  FOR EACH ROW
  EXECUTE FUNCTION notify_breaking_news();
*/

-- =============================================================================
-- SETUP COMPLETE
-- =============================================================================
--
-- Next steps:
-- 1. Deploy the Edge Function:
--    supabase functions deploy send-notification
--
-- 2. Set the EXPO_ACCESS_TOKEN secret:
--    supabase secrets set EXPO_ACCESS_TOKEN=your_expo_access_token
--
-- 3. Build new development build:
--    eas build --profile development --platform all
--
-- 4. Test on physical device (simulators don't support push)
--    Use https://expo.dev/notifications to send test notifications
