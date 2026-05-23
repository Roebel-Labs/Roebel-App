"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function assertCanWrite(
  accountId: string,
  walletAddress: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: account, error: accErr } = await supabase
    .from("accounts")
    .select("id, account_type, sub_type, is_extern, extern_status")
    .eq("id", accountId)
    .maybeSingle();

  if (accErr || !account) return { ok: false, error: "Konto nicht gefunden" };
  if (account.account_type !== "organisation") {
    return { ok: false, error: "Nur Organisationskonten dürfen Stories anlegen" };
  }
  if (account.sub_type !== "stadt") {
    return {
      ok: false,
      error: "Stories sind aktuell nur für das Stadt-Konto verfügbar",
    };
  }
  if (account.is_extern && account.extern_status !== "approved") {
    return { ok: false, error: "Externes Konto wartet auf Freigabe" };
  }

  const { data: owner, error: ownerErr } = await supabase
    .from("account_owners")
    .select("role")
    .eq("account_id", accountId)
    .eq("wallet_address", walletAddress.toLowerCase())
    .maybeSingle();

  if (ownerErr || !owner) {
    return { ok: false, error: "Keine Berechtigung für diese Organisation" };
  }
  if (owner.role !== "owner" && owner.role !== "admin") {
    return { ok: false, error: "Nur Inhaber:innen oder Admins dürfen Stories anlegen" };
  }

  return { ok: true };
}

export interface SlideInput {
  id?: string;
  background_image_url: string;
  overlay_text: string;
  text_color?: string | null;
}

export async function createStoryCollection(input: {
  account_id: string;
  wallet_address: string;
  title: string;
  subtitle?: string | null;
  cover_image_url?: string | null;
  show_on_profile: boolean;
  show_on_home_feed: boolean;
  is_published: boolean;
  display_order?: number;
  slides: SlideInput[];
}) {
  try {
    const supabase = await createClient();

    if (!input.account_id || !input.wallet_address || !input.title) {
      return { success: false, error: "Pflichtfelder fehlen" };
    }
    if (input.slides.length === 0) {
      return { success: false, error: "Mindestens ein Slide ist erforderlich" };
    }

    const guard = await assertCanWrite(input.account_id, input.wallet_address);
    if (!guard.ok) return { success: false, error: guard.error };

    const { data: collection, error: cErr } = await supabase
      .from("story_collections")
      .insert({
        account_id: input.account_id,
        title: input.title,
        subtitle: input.subtitle ?? null,
        cover_image_url: input.cover_image_url ?? null,
        show_on_profile: input.show_on_profile,
        show_on_home_feed: input.show_on_home_feed,
        is_published: input.is_published,
        display_order: input.display_order ?? 0,
      })
      .select()
      .single();

    if (cErr || !collection) throw cErr;

    const slideRows = input.slides.map((s, i) => ({
      collection_id: collection.id,
      background_image_url: s.background_image_url,
      overlay_text: s.overlay_text,
      text_color: s.text_color ?? null,
      display_order: i,
    }));

    const { error: sErr } = await supabase.from("story_slides").insert(slideRows);
    if (sErr) throw sErr;

    revalidatePath("/dashboard/story-collections");

    return { success: true, data: collection, message: "Story-Sammlung erstellt" };
  } catch (error) {
    console.error("createStoryCollection error:", error);
    return { success: false, error: "Fehler beim Erstellen" };
  }
}

export async function updateStoryCollection(
  id: string,
  input: {
    account_id: string;
    wallet_address: string;
    title: string;
    subtitle?: string | null;
    cover_image_url?: string | null;
    show_on_profile: boolean;
    show_on_home_feed: boolean;
    is_published: boolean;
    display_order?: number;
    slides: SlideInput[];
  }
) {
  try {
    const supabase = await createClient();

    if (!input.account_id || !input.wallet_address || !input.title) {
      return { success: false, error: "Pflichtfelder fehlen" };
    }
    if (input.slides.length === 0) {
      return { success: false, error: "Mindestens ein Slide ist erforderlich" };
    }

    const guard = await assertCanWrite(input.account_id, input.wallet_address);
    if (!guard.ok) return { success: false, error: guard.error };

    const { data: current } = await supabase
      .from("story_collections")
      .select("account_id")
      .eq("id", id)
      .maybeSingle();

    if (!current || current.account_id !== input.account_id) {
      return { success: false, error: "Story-Sammlung nicht gefunden" };
    }

    const { error: cErr } = await supabase
      .from("story_collections")
      .update({
        title: input.title,
        subtitle: input.subtitle ?? null,
        cover_image_url: input.cover_image_url ?? null,
        show_on_profile: input.show_on_profile,
        show_on_home_feed: input.show_on_home_feed,
        is_published: input.is_published,
        display_order: input.display_order ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (cErr) throw cErr;

    // Replace slides wholesale — simpler than diffing.
    const { error: delErr } = await supabase
      .from("story_slides")
      .delete()
      .eq("collection_id", id);
    if (delErr) throw delErr;

    const slideRows = input.slides.map((s, i) => ({
      collection_id: id,
      background_image_url: s.background_image_url,
      overlay_text: s.overlay_text,
      text_color: s.text_color ?? null,
      display_order: i,
    }));

    const { error: sErr } = await supabase.from("story_slides").insert(slideRows);
    if (sErr) throw sErr;

    revalidatePath("/dashboard/story-collections");
    revalidatePath(`/dashboard/story-collections/${id}/edit`);

    return { success: true, message: "Story-Sammlung aktualisiert" };
  } catch (error) {
    console.error("updateStoryCollection error:", error);
    return { success: false, error: "Fehler beim Aktualisieren" };
  }
}

export async function deleteStoryCollection(
  id: string,
  account_id: string,
  wallet_address: string
) {
  try {
    const supabase = await createClient();

    const guard = await assertCanWrite(account_id, wallet_address);
    if (!guard.ok) return { success: false, error: guard.error };

    const { error } = await supabase
      .from("story_collections")
      .delete()
      .eq("id", id)
      .eq("account_id", account_id);

    if (error) throw error;

    revalidatePath("/dashboard/story-collections");

    return { success: true, message: "Story-Sammlung gelöscht" };
  } catch (error) {
    console.error("deleteStoryCollection error:", error);
    return { success: false, error: "Fehler beim Löschen" };
  }
}

export async function setStoryCollectionFlags(
  id: string,
  account_id: string,
  wallet_address: string,
  flags: {
    show_on_profile?: boolean;
    show_on_home_feed?: boolean;
    is_published?: boolean;
  }
) {
  try {
    const supabase = await createClient();

    const guard = await assertCanWrite(account_id, wallet_address);
    if (!guard.ok) return { success: false, error: guard.error };

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof flags.show_on_profile === "boolean")
      patch.show_on_profile = flags.show_on_profile;
    if (typeof flags.show_on_home_feed === "boolean")
      patch.show_on_home_feed = flags.show_on_home_feed;
    if (typeof flags.is_published === "boolean")
      patch.is_published = flags.is_published;

    const { error } = await supabase
      .from("story_collections")
      .update(patch)
      .eq("id", id)
      .eq("account_id", account_id);

    if (error) throw error;

    revalidatePath("/dashboard/story-collections");

    return { success: true };
  } catch (error) {
    console.error("setStoryCollectionFlags error:", error);
    return { success: false, error: "Fehler beim Aktualisieren" };
  }
}
