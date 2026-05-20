"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { OpeningHours } from "@/types/business";

export async function updateAccountOpeningHours(
  accountId: string,
  hours: OpeningHours,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("accounts")
    .update({ opening_hours: hours, updated_at: new Date().toISOString() })
    .eq("id", accountId);

  if (error) {
    console.error("updateAccountOpeningHours error:", error);
    return { success: false, error: "Öffnungszeiten konnten nicht gespeichert werden." };
  }

  revalidatePath("/dashboard/opening-hours");
  revalidatePath(`/app/orgs/${accountId}`);
  return { success: true };
}
