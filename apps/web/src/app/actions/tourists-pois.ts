"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  AdvisoryRecord,
  HelpRequestRecord,
  HelpRequestStatus,
  PoiRecord,
} from "@/lib/supabase-tourists";

const TOURISTS_POIS_PATH = "/admin/dashboard/tourists/pois";

// ---------- POIs ----------

export async function listPois() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pois")
    .select("*")
    .order("name_de", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PoiRecord[];
}

export async function upsertPoi(input: Partial<PoiRecord> & { id?: string }) {
  try {
    const supabase = await createClient();
    const payload = {
      ...input,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = input.id
      ? await supabase
          .from("pois")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single()
      : await supabase.from("pois").insert(payload).select().single();
    if (error) throw error;
    revalidatePath(TOURISTS_POIS_PATH);
    return { success: true, data: data as PoiRecord };
  } catch (error) {
    console.error("upsertPoi error", error);
    return { success: false, error: "Fehler beim Speichern des POI" };
  }
}

export async function deletePoi(id: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("pois").delete().eq("id", id);
    if (error) throw error;
    revalidatePath(TOURISTS_POIS_PATH);
    return { success: true };
  } catch (error) {
    console.error("deletePoi error", error);
    return { success: false, error: "Fehler beim Löschen des POI" };
  }
}

// ---------- Advisories ----------

export async function listAdvisories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_advisories")
    .select("*")
    .order("advisory_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdvisoryRecord[];
}

export async function upsertAdvisory(
  input: Partial<AdvisoryRecord> & { id?: string },
) {
  try {
    const supabase = await createClient();
    const { data, error } = input.id
      ? await supabase
          .from("daily_advisories")
          .update(input)
          .eq("id", input.id)
          .select()
          .single()
      : await supabase
          .from("daily_advisories")
          .insert(input)
          .select()
          .single();
    if (error) throw error;
    revalidatePath(TOURISTS_POIS_PATH);
    return { success: true, data: data as AdvisoryRecord };
  } catch (error) {
    console.error("upsertAdvisory error", error);
    return { success: false, error: "Fehler beim Speichern des Hinweises" };
  }
}

export async function deleteAdvisory(id: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("daily_advisories")
      .delete()
      .eq("id", id);
    if (error) throw error;
    revalidatePath(TOURISTS_POIS_PATH);
    return { success: true };
  } catch (error) {
    console.error("deleteAdvisory error", error);
    return { success: false, error: "Fehler beim Löschen des Hinweises" };
  }
}

// ---------- Help requests ----------

export async function listHelpRequests() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("help_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HelpRequestRecord[];
}

export async function setHelpRequestStatus(
  id: string,
  status: HelpRequestStatus,
) {
  try {
    const supabase = await createClient();
    const updates: Record<string, unknown> = { status };
    if (status === "responded") updates.responded_at = new Date().toISOString();
    if (status === "resolved") updates.resolved_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("help_requests")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    revalidatePath(TOURISTS_POIS_PATH);
    return { success: true, data: data as HelpRequestRecord };
  } catch (error) {
    console.error("setHelpRequestStatus error", error);
    return { success: false, error: "Status konnte nicht aktualisiert werden" };
  }
}
