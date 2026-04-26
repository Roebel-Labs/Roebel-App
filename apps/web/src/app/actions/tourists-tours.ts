"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  TourCompletionRecord,
  TourRecord,
  TourStopRecord,
} from "@/lib/supabase-tourists";

const PATH = "/admin/dashboard/tourists/tours";

// ---------- Tours ----------

export async function listTours() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tours")
    .select("*")
    .order("title_de", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TourRecord[];
}

export async function getTour(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tours")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as TourRecord;
}

export async function upsertTour(
  input: Partial<TourRecord> & { id?: string },
) {
  try {
    const supabase = await createClient();
    const payload = { ...input, updated_at: new Date().toISOString() };
    const { data, error } = input.id
      ? await supabase
          .from("tours")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single()
      : await supabase.from("tours").insert(payload).select().single();
    if (error) throw error;
    revalidatePath(PATH);
    if (input.id) revalidatePath(`${PATH}/${input.id}`);
    return { success: true, data: data as TourRecord };
  } catch (error) {
    console.error("upsertTour error", error);
    return { success: false, error: "Fehler beim Speichern der Tour" };
  }
}

export async function deleteTour(id: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tours").delete().eq("id", id);
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("deleteTour error", error);
    return { success: false, error: "Fehler beim Löschen der Tour" };
  }
}

// "Mecky's Tipp heute" is exclusive — clear all others, then set the chosen tour.
export async function setMeckysTipp(id: string) {
  try {
    const supabase = await createClient();
    const { error: clearError } = await supabase
      .from("tours")
      .update({ is_meckys_tipp_today: false })
      .eq("is_meckys_tipp_today", true);
    if (clearError) throw clearError;
    const { error } = await supabase
      .from("tours")
      .update({ is_meckys_tipp_today: true })
      .eq("id", id);
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("setMeckysTipp error", error);
    return { success: false, error: "Fehler beim Setzen von Mecky's Tipp" };
  }
}

// ---------- Tour stops ----------

export async function listTourStops(tourId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tour_stops")
    .select("*")
    .eq("tour_id", tourId)
    .order("stop_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TourStopRecord[];
}

export async function upsertTourStop(
  input: Partial<TourStopRecord> & { id?: string; tour_id: string },
) {
  try {
    const supabase = await createClient();
    const { data, error } = input.id
      ? await supabase
          .from("tour_stops")
          .update(input)
          .eq("id", input.id)
          .select()
          .single()
      : await supabase
          .from("tour_stops")
          .insert(input)
          .select()
          .single();
    if (error) throw error;
    revalidatePath(`${PATH}/${input.tour_id}`);
    return { success: true, data: data as TourStopRecord };
  } catch (error) {
    console.error("upsertTourStop error", error);
    return { success: false, error: "Fehler beim Speichern des Tour-Stops" };
  }
}

export async function deleteTourStop(id: string, tourId: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tour_stops").delete().eq("id", id);
    if (error) throw error;
    revalidatePath(`${PATH}/${tourId}`);
    return { success: true };
  } catch (error) {
    console.error("deleteTourStop error", error);
    return { success: false, error: "Fehler beim Löschen des Tour-Stops" };
  }
}

// ---------- Read-only completions ----------

export async function listTourCompletions(tourId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tour_completions")
    .select("*")
    .eq("tour_id", tourId)
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TourCompletionRecord[];
}
