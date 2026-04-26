"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  WildlifeSeasonalEventRecord,
  WildlifeSightingRecord,
  WildlifeSpeciesRecord,
} from "@/lib/supabase-tourists";

const PATH = "/admin/dashboard/tourists/wildlife";

// ---------- Species ----------

export async function listSpecies() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wildlife_species")
    .select("*")
    .order("name_de", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WildlifeSpeciesRecord[];
}

export async function upsertSpecies(
  input: Partial<WildlifeSpeciesRecord> & { id?: string },
) {
  try {
    const supabase = await createClient();
    const payload = { ...input, updated_at: new Date().toISOString() };
    const { data, error } = input.id
      ? await supabase
          .from("wildlife_species")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single()
      : await supabase
          .from("wildlife_species")
          .insert(payload)
          .select()
          .single();
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true, data: data as WildlifeSpeciesRecord };
  } catch (error) {
    console.error("upsertSpecies error", error);
    return { success: false, error: "Fehler beim Speichern der Art" };
  }
}

export async function deleteSpecies(id: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("wildlife_species")
      .delete()
      .eq("id", id);
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("deleteSpecies error", error);
    return { success: false, error: "Fehler beim Löschen der Art" };
  }
}

// ---------- Seasonal events ----------

export async function listSeasonalEvents() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wildlife_seasonal_events")
    .select("*")
    .order("start_month", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WildlifeSeasonalEventRecord[];
}

export async function upsertSeasonalEvent(
  input: Partial<WildlifeSeasonalEventRecord> & { id?: string },
) {
  try {
    const supabase = await createClient();
    const { data, error } = input.id
      ? await supabase
          .from("wildlife_seasonal_events")
          .update(input)
          .eq("id", input.id)
          .select()
          .single()
      : await supabase
          .from("wildlife_seasonal_events")
          .insert(input)
          .select()
          .single();
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true, data: data as WildlifeSeasonalEventRecord };
  } catch (error) {
    console.error("upsertSeasonalEvent error", error);
    return { success: false, error: "Fehler beim Speichern des Saison-Events" };
  }
}

export async function deleteSeasonalEvent(id: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("wildlife_seasonal_events")
      .delete()
      .eq("id", id);
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("deleteSeasonalEvent error", error);
    return { success: false, error: "Fehler beim Löschen des Saison-Events" };
  }
}

// ---------- Sightings ----------

export async function listSightings() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wildlife_sightings")
    .select("*")
    .order("observed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WildlifeSightingRecord[];
}

export async function setSightingVisibility(id: string, isVisible: boolean) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("wildlife_sightings")
      .update({ is_visible: isVisible })
      .eq("id", id);
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("setSightingVisibility error", error);
    return { success: false, error: "Sichtbarkeit konnte nicht geändert werden" };
  }
}

export async function verifySighting(
  id: string,
  verified: boolean,
  note?: string,
) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("wildlife_sightings")
      .update({
        verified_by_mecky: verified,
        mecky_verification_note_de: note ?? null,
      })
      .eq("id", id);
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("verifySighting error", error);
    return { success: false, error: "Verifizierung fehlgeschlagen" };
  }
}

export async function deleteSighting(id: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("wildlife_sightings")
      .delete()
      .eq("id", id);
    if (error) throw error;
    revalidatePath(PATH);
    return { success: true };
  } catch (error) {
    console.error("deleteSighting error", error);
    return { success: false, error: "Fehler beim Löschen der Sichtung" };
  }
}
