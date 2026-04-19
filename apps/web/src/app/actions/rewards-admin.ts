"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// ── Types ──────────────────────────────────────────────

export interface RewardTask {
  id: string
  key: string
  title: string
  description: string
  image_url: string | null
  coin_amount: number
  cta_label: string
  cta_route: string | null
  is_repeatable: boolean
  cooldown_hours: number
  display_order: number
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface Lootbox {
  id: string
  name: string
  description: string | null
  image_url: string | null
  coins_per_key: number
  /**
   * When set, open_lootbox only draws rewards of this type (e.g. the
   * Rahmen-Truhe guarantees a profile_frame). NULL means mystery chest
   * drawing from the full weighted pool.
   */
  guaranteed_reward_type: LootboxRewardType | null
  display_order: number
  is_published: boolean
  created_at: string
  updated_at: string
}

export type LootboxRewardType =
  | "profile_frame"
  | "sticker"
  | "animated_sticker"
  | "profile_banner"
  | "badge"
  | "coin_bundle"

export type LootboxRewardRarity = "common" | "rare" | "epic" | "legendary"

export interface LootboxReward {
  id: string
  type: LootboxRewardType
  name: string
  description: string | null
  asset_url: string
  rarity: LootboxRewardRarity
  coin_value: number | null
  created_at: string
}

export interface LootboxRewardPoolRow {
  lootbox_id: string
  reward_id: string
  weight: number
}

// ── Helpers ────────────────────────────────────────────

function formatError(error: unknown): string {
  if (!error) return "Unbekannter Fehler"
  if (typeof error === "string") return error
  if (typeof error === "object") {
    const e = error as { message?: string; details?: string; hint?: string; code?: string }
    const parts: string[] = []
    if (e.message) parts.push(e.message)
    if (e.details) parts.push(`Details: ${e.details}`)
    if (e.hint) parts.push(`Hinweis: ${e.hint}`)
    if (e.code) parts.push(`Code: ${e.code}`)
    if (parts.length > 0) return parts.join(" · ")
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function bumpAdmin() {
  revalidatePath("/admin/dashboard/rewards")
}

// ── Tasks CRUD ─────────────────────────────────────────

export async function listRewardTasks(): Promise<RewardTask[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("rewards_tasks")
    .select("*")
    .order("display_order", { ascending: true })
  if (error) {
    console.error("[rewards-admin] listRewardTasks:", formatError(error))
    return []
  }
  return data || []
}

export async function createRewardTask(formData: FormData) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rewards_tasks")
      .insert({
        key: formData.get("key") as string,
        title: formData.get("title") as string,
        description: formData.get("description") as string,
        image_url: (formData.get("image_url") as string) || null,
        coin_amount: Number(formData.get("coin_amount") ?? 0),
        cta_label: (formData.get("cta_label") as string) || "Mitmachen",
        cta_route: (formData.get("cta_route") as string) || null,
        is_repeatable: formData.get("is_repeatable") === "true",
        cooldown_hours: Number(formData.get("cooldown_hours") ?? 0),
        display_order: Number(formData.get("display_order") ?? 0),
        is_published: formData.get("is_published") === "true",
      })
      .select()
      .single()
    if (error) throw error
    bumpAdmin()
    return { success: true, data, message: "Aufgabe erstellt" }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
}

export async function updateRewardTask(id: string, formData: FormData) {
  try {
    const supabase = await createClient()
    const patch: Partial<RewardTask> = {
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      image_url: (formData.get("image_url") as string) || null,
      coin_amount: Number(formData.get("coin_amount") ?? 0),
      cta_label: (formData.get("cta_label") as string) || "Mitmachen",
      cta_route: (formData.get("cta_route") as string) || null,
      is_repeatable: formData.get("is_repeatable") === "true",
      cooldown_hours: Number(formData.get("cooldown_hours") ?? 0),
      display_order: Number(formData.get("display_order") ?? 0),
      is_published: formData.get("is_published") === "true",
    }
    const { error } = await supabase.from("rewards_tasks").update(patch).eq("id", id)
    if (error) throw error
    bumpAdmin()
    return { success: true, message: "Aufgabe aktualisiert" }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
}

export async function countRewardTaskDependencies(
  id: string
): Promise<{ completions: number }> {
  const supabase = await createClient()
  const { count } = await supabase
    .from("rewards_task_completions")
    .select("*", { count: "exact", head: true })
    .eq("task_id", id)
  return { completions: count ?? 0 }
}

export async function deleteRewardTask(
  id: string,
  opts?: { force?: boolean }
) {
  try {
    const supabase = await createClient()
    if (!opts?.force) {
      const { completions } = await countRewardTaskDependencies(id)
      if (completions > 0) {
        return {
          success: false,
          needsConfirm: true as const,
          counts: { completions },
          error: `${completions} Abschlüsse sind mit dieser Aufgabe verknüpft. Bestätigung erforderlich.`,
        }
      }
    }
    const { error } = await supabase.from("rewards_tasks").delete().eq("id", id)
    if (error) throw error
    bumpAdmin()
    return { success: true, message: "Aufgabe gelöscht" }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
}

export async function toggleRewardTaskPublished(id: string, next: boolean) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("rewards_tasks")
      .update({ is_published: next })
      .eq("id", id)
    if (error) throw error
    bumpAdmin()
    return { success: true }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
}

// ── Lootboxes CRUD ─────────────────────────────────────

export async function listLootboxes(): Promise<Lootbox[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("lootboxes")
    .select("*")
    .order("display_order", { ascending: true })
  if (error) {
    console.error("[rewards-admin] listLootboxes:", formatError(error))
    return []
  }
  return data || []
}

export async function createLootbox(formData: FormData) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("lootboxes")
      .insert({
        name: formData.get("name") as string,
        description: (formData.get("description") as string) || null,
        image_url: (formData.get("image_url") as string) || null,
        coins_per_key: Number(formData.get("coins_per_key") ?? 200),
        display_order: Number(formData.get("display_order") ?? 0),
        is_published: formData.get("is_published") === "true",
      })
      .select()
      .single()
    if (error) throw error
    bumpAdmin()
    return { success: true, data, message: "Truhe erstellt" }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
}

export async function updateLootbox(id: string, formData: FormData) {
  try {
    const supabase = await createClient()
    const patch = {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      image_url: (formData.get("image_url") as string) || null,
      coins_per_key: Number(formData.get("coins_per_key") ?? 200),
      display_order: Number(formData.get("display_order") ?? 0),
      is_published: formData.get("is_published") === "true",
    }
    const { error } = await supabase.from("lootboxes").update(patch).eq("id", id)
    if (error) throw error
    bumpAdmin()
    return { success: true, message: "Truhe aktualisiert" }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
}

export async function countLootboxDependencies(
  id: string
): Promise<{ ownedRewards: number; keys: number }> {
  const supabase = await createClient()
  const [ownedRes, keysRes] = await Promise.all([
    supabase
      .from("user_lootbox_rewards")
      .select("*", { count: "exact", head: true })
      .eq("lootbox_id", id),
    supabase
      .from("user_lootbox_keys")
      .select("*", { count: "exact", head: true })
      .eq("lootbox_id", id),
  ])
  return {
    ownedRewards: ownedRes.count ?? 0,
    keys: keysRes.count ?? 0,
  }
}

export async function setLootboxPublished(id: string, next: boolean) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("lootboxes")
      .update({ is_published: next })
      .eq("id", id)
    if (error) throw error
    bumpAdmin()
    return { success: true, message: next ? "Truhe veröffentlicht" : "Truhe ausgeblendet" }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
}

export async function deleteLootbox(id: string, opts?: { force?: boolean }) {
  try {
    const supabase = await createClient()
    if (!opts?.force) {
      const deps = await countLootboxDependencies(id)
      if (deps.ownedRewards > 0 || deps.keys > 0) {
        return {
          success: false,
          needsConfirm: true as const,
          counts: deps,
          error: `Aktive Nutzerdaten vorhanden (Schlüssel: ${deps.keys}, gewonnene Belohnungen: ${deps.ownedRewards}). Bestätigung erforderlich.`,
        }
      }
    }
    const { error } = await supabase.from("lootboxes").delete().eq("id", id)
    if (error) throw error
    bumpAdmin()
    return { success: true, message: "Truhe gelöscht" }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
}

// ── Reward catalogue CRUD ──────────────────────────────

export async function listLootboxRewards(): Promise<LootboxReward[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("lootbox_rewards")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) {
    console.error("[rewards-admin] listLootboxRewards:", formatError(error))
    return []
  }
  return data || []
}

export async function createLootboxReward(formData: FormData) {
  try {
    const supabase = await createClient()
    const coinValueRaw = formData.get("coin_value") as string | null
    const { data, error } = await supabase
      .from("lootbox_rewards")
      .insert({
        type: formData.get("type") as LootboxRewardType,
        name: formData.get("name") as string,
        description: (formData.get("description") as string) || null,
        asset_url: formData.get("asset_url") as string,
        rarity: (formData.get("rarity") as LootboxRewardRarity) || "common",
        coin_value: coinValueRaw ? Number(coinValueRaw) : null,
      })
      .select()
      .single()
    if (error) throw error
    bumpAdmin()
    return { success: true, data, message: "Belohnung erstellt" }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
}

export async function updateLootboxReward(id: string, formData: FormData) {
  try {
    const supabase = await createClient()
    const coinValueRaw = formData.get("coin_value") as string | null
    const patch = {
      type: formData.get("type") as LootboxRewardType,
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      asset_url: formData.get("asset_url") as string,
      rarity: (formData.get("rarity") as LootboxRewardRarity) || "common",
      coin_value: coinValueRaw ? Number(coinValueRaw) : null,
    }
    const { error } = await supabase.from("lootbox_rewards").update(patch).eq("id", id)
    if (error) throw error
    bumpAdmin()
    return { success: true, message: "Belohnung aktualisiert" }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
}

export async function countLootboxRewardDependencies(
  id: string
): Promise<{ ownedRewards: number }> {
  const supabase = await createClient()
  const { count } = await supabase
    .from("user_lootbox_rewards")
    .select("*", { count: "exact", head: true })
    .eq("reward_id", id)
  return { ownedRewards: count ?? 0 }
}

export async function deleteLootboxReward(
  id: string,
  opts?: { force?: boolean }
) {
  try {
    const supabase = await createClient()
    if (!opts?.force) {
      const { ownedRewards } = await countLootboxRewardDependencies(id)
      if (ownedRewards > 0) {
        return {
          success: false,
          needsConfirm: true as const,
          counts: { ownedRewards },
          error: `${ownedRewards} Nutzer besitzen diese Belohnung bereits. Bestätigung erforderlich.`,
        }
      }
    }
    const { error } = await supabase.from("lootbox_rewards").delete().eq("id", id)
    if (error) throw error
    bumpAdmin()
    return { success: true, message: "Belohnung gelöscht" }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
}

// ── Lootbox reward pool (weights) ──────────────────────

export async function listLootboxPool(lootboxId: string): Promise<LootboxRewardPoolRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("lootbox_reward_pool")
    .select("*")
    .eq("lootbox_id", lootboxId)
  if (error) {
    console.error("[rewards-admin] listLootboxPool:", formatError(error))
    return []
  }
  return data || []
}

export async function upsertLootboxPoolRow(
  lootboxId: string,
  rewardId: string,
  weight: number
) {
  try {
    const supabase = await createClient()
    if (weight <= 0) {
      const { error } = await supabase
        .from("lootbox_reward_pool")
        .delete()
        .match({ lootbox_id: lootboxId, reward_id: rewardId })
      if (error) throw error
    } else {
      const { error } = await supabase
        .from("lootbox_reward_pool")
        .upsert(
          { lootbox_id: lootboxId, reward_id: rewardId, weight },
          { onConflict: "lootbox_id,reward_id" }
        )
      if (error) throw error
    }
    bumpAdmin()
    return { success: true }
  } catch (error) {
    return { success: false, error: formatError(error) }
  }
}
