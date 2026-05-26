/**
 * Supabase Edge Function: send-notification
 *
 * Sends push notifications via Expo Push API to registered devices.
 * Filters recipients based on notification preferences.
 *
 * Deploy: supabase functions deploy send-notification
 * Set secrets:
 *   supabase secrets set EXPO_ACCESS_TOKEN=your_expo_access_token
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Notification payload types
interface NotificationPayload {
  type: 'event_new' | 'news_breaking' | 'news_featured' | 'post_new' | 'direct_message';
  title: string;
  body: string;
  data?: {
    eventId?: string;
    slug?: string;
    [key: string]: unknown;
  };
  category?: string; // Event category for filtering
  // When present, the notification targets only devices whose push token is
  // linked to one of these wallet addresses (used for direct messages).
  walletAddresses?: string[];
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
}

interface PushToken {
  device_id: string;
  expo_push_token: string;
}

interface NotificationPreference {
  device_id: string;
  events_enabled: boolean;
  event_categories: string[];
  news_enabled: boolean;
  news_breaking: boolean;
  news_featured: boolean;
  feed_posts_enabled: boolean;
  dms_enabled: boolean;
}

serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const payload: NotificationPayload = await req.json();
    const { type, title, body, data, category, walletAddresses } = payload;

    if (!type || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type, title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch active push tokens. When walletAddresses is provided (e.g. direct
    // messages), scope to the devices of those users; otherwise broadcast.
    let tokensQuery = supabase
      .from('push_tokens')
      .select('device_id, expo_push_token')
      .eq('is_active', true);

    if (walletAddresses && walletAddresses.length > 0) {
      tokensQuery = tokensQuery.in(
        'wallet_address',
        walletAddresses.map((w) => w.toLowerCase())
      );
    }

    const { data: tokens, error: tokensError } = await tokensQuery;

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      throw new Error(`Failed to fetch tokens: ${tokensError.message}`);
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active tokens', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch notification preferences for all devices
    const deviceIds = tokens.map((t: PushToken) => t.device_id);
    const { data: preferences, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*')
      .in('device_id', deviceIds);

    if (prefsError) {
      console.error('Error fetching preferences:', prefsError);
    }

    // Create preferences map
    const preferencesMap = new Map<string, NotificationPreference>();
    (preferences || []).forEach((pref: NotificationPreference) => {
      preferencesMap.set(pref.device_id, pref);
    });

    // Filter tokens based on notification type and preferences
    const eligibleTokens = tokens.filter((token: PushToken) => {
      const pref = preferencesMap.get(token.device_id);

      // If no preferences, use defaults (send notification)
      if (!pref) {
        return true;
      }

      switch (type) {
        case 'event_new':
          if (!pref.events_enabled) return false;
          // Check category filter if provided
          if (category && pref.event_categories && !pref.event_categories.includes(category)) {
            return false;
          }
          return true;

        case 'news_breaking':
          return pref.news_enabled && pref.news_breaking;

        case 'news_featured':
          return pref.news_enabled && pref.news_featured;

        case 'post_new':
          // New "Für Alle" feed post — opt-out per device (defaults to on)
          return pref.feed_posts_enabled !== false;

        case 'direct_message':
          // New direct message — opt-out per device (defaults to on)
          return pref.dms_enabled !== false;

        default:
          return true;
      }
    });

    if (eligibleTokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No eligible recipients', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build Expo push messages
    const messages: ExpoPushMessage[] = eligibleTokens.map((token: PushToken) => ({
      to: token.expo_push_token,
      title,
      body,
      data: {
        type,
        ...data,
      },
      sound: 'default',
      channelId: 'default',
      priority: 'high',
      ttl: 86400, // 24 hours
    }));

    // Send in chunks of 100 (Expo limit)
    const chunkSize = 100;
    const chunks: ExpoPushMessage[][] = [];
    for (let i = 0; i < messages.length; i += chunkSize) {
      chunks.push(messages.slice(i, i + chunkSize));
    }

    const allTickets: ExpoPushTicket[] = [];
    const receiptIds: string[] = [];

    for (const chunk of chunks) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      };

      // Add Expo access token if available (recommended for enhanced security)
      if (expoAccessToken) {
        headers['Authorization'] = `Bearer ${expoAccessToken}`;
      }

      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });

      const result = await response.json();

      if (result.data) {
        allTickets.push(...result.data);
        result.data.forEach((ticket: ExpoPushTicket) => {
          if (ticket.status === 'ok' && ticket.id) {
            receiptIds.push(ticket.id);
          }
        });
      }
    }

    // Count results
    const successful = allTickets.filter((t) => t.status === 'ok').length;
    const failed = allTickets.filter((t) => t.status === 'error').length;

    // Log notification for analytics
    await supabase.from('notification_log').insert({
      notification_type: type,
      title,
      body,
      data,
      tokens_sent: successful,
      tokens_failed: failed,
      status: failed === 0 ? 'sent' : successful > 0 ? 'partial' : 'failed',
    });

    // Handle invalid tokens (DeviceNotRegistered errors)
    const invalidTokenIndices = allTickets
      .map((ticket, index) =>
        ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered'
          ? index
          : -1
      )
      .filter((index) => index !== -1);

    if (invalidTokenIndices.length > 0) {
      const invalidDeviceIds = invalidTokenIndices
        .map((index) => eligibleTokens[index]?.device_id)
        .filter(Boolean);

      if (invalidDeviceIds.length > 0) {
        await supabase
          .from('push_tokens')
          .update({ is_active: false })
          .in('device_id', invalidDeviceIds);

        console.log(`Deactivated ${invalidDeviceIds.length} invalid tokens`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: successful,
        failed,
        total: eligibleTokens.length,
        receiptIds: receiptIds.slice(0, 10), // Return first 10 for reference
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending notification:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to send notification' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
