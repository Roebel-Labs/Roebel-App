import { createClient } from "@/lib/supabase/server";
import { AppEventsContent } from "@/components/app/AppEventsContent";

export const dynamic = "force-dynamic";

export default async function AppEventsPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select("*, accounts:account_id(id, name, avatar_url, account_type)")
    .eq("status", "approved")
    .order("date", { ascending: true });

  return <AppEventsContent initialEvents={events || []} />;
}
