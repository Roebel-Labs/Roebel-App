"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  TransitDepartureRecord,
  TransitLineRecord,
  TransitStopRecord,
} from "@/lib/supabase-tourists";

const PATH = "/admin/dashboard/tourists/transit";

// ---------- Lines ----------

export async function listTransitLines() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transit_lines")
    .select("*")
    .order("code", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TransitLineRecord[];
}

export async function upsertTransitLine(
  input: Partial<TransitLineRecord> & { id?: string },
) {
  try {
    const supabase = await createClient();
    const payload = { ...input, updated_at: new Date().toISOString() };
    const { data, error } = input.id
      ? await supabase
          .from("transit_lines")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single()
      : await supabase
          .from("transit_lines")
          .insert(payload)
          .select()
          .single();
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true, data: data as TransitLineRecord };
  } catch (error) {
    console.error("upsertTransitLine error", error);
    return { success: false, error: "Fehler beim Speichern der Linie" };
  }
}

export async function deleteTransitLine(id: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("transit_lines")
      .delete()
      .eq("id", id);
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("deleteTransitLine error", error);
    return { success: false, error: "Fehler beim Löschen der Linie" };
  }
}

// ---------- Stops ----------

export async function listTransitStops(lineId?: string) {
  const supabase = await createClient();
  let q = supabase.from("transit_stops").select("*");
  if (lineId) q = q.eq("line_id", lineId);
  const { data, error } = await q.order("stop_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TransitStopRecord[];
}

export async function upsertTransitStop(
  input: Partial<TransitStopRecord> & { id?: string },
) {
  try {
    const supabase = await createClient();
    const { data, error } = input.id
      ? await supabase
          .from("transit_stops")
          .update(input)
          .eq("id", input.id)
          .select()
          .single()
      : await supabase
          .from("transit_stops")
          .insert(input)
          .select()
          .single();
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true, data: data as TransitStopRecord };
  } catch (error) {
    console.error("upsertTransitStop error", error);
    return { success: false, error: "Fehler beim Speichern der Haltestelle" };
  }
}

export async function deleteTransitStop(id: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("transit_stops")
      .delete()
      .eq("id", id);
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("deleteTransitStop error", error);
    return { success: false, error: "Fehler beim Löschen der Haltestelle" };
  }
}

// ---------- Departures ----------

export async function listTransitDepartures(lineId?: string) {
  const supabase = await createClient();
  let q = supabase.from("transit_departures").select("*");
  if (lineId) q = q.eq("line_id", lineId);
  const { data, error } = await q.order("departure_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TransitDepartureRecord[];
}

export async function upsertTransitDeparture(
  input: Partial<TransitDepartureRecord> & { id?: string },
) {
  try {
    const supabase = await createClient();
    const { data, error } = input.id
      ? await supabase
          .from("transit_departures")
          .update(input)
          .eq("id", input.id)
          .select()
          .single()
      : await supabase
          .from("transit_departures")
          .insert(input)
          .select()
          .single();
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true, data: data as TransitDepartureRecord };
  } catch (error) {
    console.error("upsertTransitDeparture error", error);
    return { success: false, error: "Fehler beim Speichern der Abfahrt" };
  }
}

export async function deleteTransitDeparture(id: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("transit_departures")
      .delete()
      .eq("id", id);
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("deleteTransitDeparture error", error);
    return { success: false, error: "Fehler beim Löschen der Abfahrt" };
  }
}
