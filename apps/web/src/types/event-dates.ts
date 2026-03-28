export interface EventDate {
  id: string;
  event_id: string;
  date: string;
  is_cancelled: boolean;
  notes: string | null;
  created_at: string;
}

export interface EventWithDates {
  id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  end_time: string | null;
  location: string;
  organizer_name: string;
  organizer_email: string;
  organizer_phone: string | null;
  category: string | null;
  image_url: string | null;
  website_url: string | null;
  ticket_price: number | null;
  max_attendees: number | null;
  is_popular?: boolean;
  is_recurring: boolean;
  status?: string;
  created_at: string;
  updated_at?: string;
  latitude?: number | null;
  longitude?: number | null;
  place_id?: string | null;
  formatted_address?: string | null;
  address_components?: unknown;
  event_dates?: EventDate[];
}
