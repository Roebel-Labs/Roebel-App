"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type {
  Restaurant,
  CreateRestaurantInput,
  UpdateRestaurantInput,
  MenuCategory,
  CreateMenuCategoryInput,
  UpdateMenuCategoryInput,
  MenuItem,
  CreateMenuItemInput,
  UpdateMenuItemInput,
  SpecialMenu,
  CreateSpecialMenuInput,
  UpdateSpecialMenuInput,
  SpecialMenuCategory,
  CreateSpecialMenuCategoryInput,
  UpdateSpecialMenuCategoryInput,
  SpecialMenuItem,
  CreateSpecialMenuItemInput,
  UpdateSpecialMenuItemInput,
} from "@/types/restaurant"

// ============================================
// Restaurant Actions
// ============================================

export async function getRestaurants() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })

    if (error) throw error
    return { success: true, data: data as Restaurant[] }
  } catch (error) {
    console.error("Error fetching restaurants:", error)
    return { success: false, error: "Fehler beim Laden der Restaurants" }
  }
}

export async function getRestaurant(id: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", id)
      .single()

    if (error) throw error
    return { success: true, data: data as Restaurant }
  } catch (error) {
    console.error("Error fetching restaurant:", error)
    return { success: false, error: "Restaurant nicht gefunden" }
  }
}

export async function createRestaurant(input: CreateRestaurantInput) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("restaurants")
      .insert(input)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/speisekarten")
    return { success: true, data: data as Restaurant, message: "Restaurant erstellt" }
  } catch (error) {
    console.error("Error creating restaurant:", error)
    return { success: false, error: "Fehler beim Erstellen des Restaurants" }
  }
}

export async function updateRestaurant(input: UpdateRestaurantInput) {
  try {
    const { id, ...updateData } = input
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("restaurants")
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/speisekarten")
    revalidatePath(`/admin/dashboard/speisekarten/${id}`)
    return { success: true, data: data as Restaurant, message: "Restaurant aktualisiert" }
  } catch (error) {
    console.error("Error updating restaurant:", error)
    return { success: false, error: "Fehler beim Aktualisieren des Restaurants" }
  }
}

export async function deleteRestaurant(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("restaurants")
      .delete()
      .eq("id", id)

    if (error) throw error

    revalidatePath("/admin/dashboard/speisekarten")
    return { success: true, message: "Restaurant gelöscht" }
  } catch (error) {
    console.error("Error deleting restaurant:", error)
    return { success: false, error: "Fehler beim Löschen des Restaurants" }
  }
}

export async function toggleRestaurantFeatured(id: string, is_featured: boolean) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("restaurants")
      .update({ is_featured, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    revalidatePath("/admin/dashboard/speisekarten")
    return {
      success: true,
      data: data as Restaurant,
      message: is_featured ? "Als Featured markiert" : "Featured entfernt",
    }
  } catch (error) {
    console.error("Error toggling featured:", error)
    return { success: false, error: "Fehler beim Aktualisieren" }
  }
}

// ============================================
// Menu Category Actions
// ============================================

export async function getMenuCategories(restaurantId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("menu_categories")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: true })

    if (error) throw error
    return { success: true, data: data as MenuCategory[] }
  } catch (error) {
    console.error("Error fetching menu categories:", error)
    return { success: false, error: "Fehler beim Laden der Kategorien" }
  }
}

export async function createMenuCategory(input: CreateMenuCategoryInput) {
  try {
    const supabase = await createClient()

    // Get max sort_order
    const { data: existing } = await supabase
      .from("menu_categories")
      .select("sort_order")
      .eq("restaurant_id", input.restaurant_id)
      .order("sort_order", { ascending: false })
      .limit(1)

    const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    const { data, error } = await supabase
      .from("menu_categories")
      .insert({ ...input, sort_order: input.sort_order ?? nextSortOrder })
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/admin/dashboard/speisekarten/${input.restaurant_id}`)
    return { success: true, data: data as MenuCategory, message: "Kategorie erstellt" }
  } catch (error) {
    console.error("Error creating menu category:", error)
    return { success: false, error: "Fehler beim Erstellen der Kategorie" }
  }
}

export async function updateMenuCategory(input: UpdateMenuCategoryInput) {
  try {
    const { id, ...updateData } = input
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("menu_categories")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    return { success: true, data: data as MenuCategory, message: "Kategorie aktualisiert" }
  } catch (error) {
    console.error("Error updating menu category:", error)
    return { success: false, error: "Fehler beim Aktualisieren der Kategorie" }
  }
}

export async function deleteMenuCategory(id: string, restaurantId: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("menu_categories")
      .delete()
      .eq("id", id)

    if (error) throw error

    revalidatePath(`/admin/dashboard/speisekarten/${restaurantId}`)
    return { success: true, message: "Kategorie gelöscht" }
  } catch (error) {
    console.error("Error deleting menu category:", error)
    return { success: false, error: "Fehler beim Löschen der Kategorie" }
  }
}

export async function reorderMenuCategories(
  restaurantId: string,
  categoryIds: string[]
) {
  try {
    const supabase = await createClient()

    // Update each category's sort_order
    const updates = categoryIds.map((id, index) =>
      supabase
        .from("menu_categories")
        .update({ sort_order: index })
        .eq("id", id)
    )

    await Promise.all(updates)

    revalidatePath(`/admin/dashboard/speisekarten/${restaurantId}`)
    return { success: true, message: "Reihenfolge aktualisiert" }
  } catch (error) {
    console.error("Error reordering categories:", error)
    return { success: false, error: "Fehler beim Aktualisieren der Reihenfolge" }
  }
}

// ============================================
// Menu Item Actions
// ============================================

export async function getMenuItems(restaurantId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: true })

    if (error) throw error
    return { success: true, data: data as MenuItem[] }
  } catch (error) {
    console.error("Error fetching menu items:", error)
    return { success: false, error: "Fehler beim Laden der Gerichte" }
  }
}

export async function createMenuItem(input: CreateMenuItemInput) {
  try {
    const supabase = await createClient()

    // Get max sort_order for category or restaurant
    const { data: existing } = await supabase
      .from("menu_items")
      .select("sort_order")
      .eq("restaurant_id", input.restaurant_id)
      .eq("category_id", input.category_id ?? null)
      .order("sort_order", { ascending: false })
      .limit(1)

    const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    const { data, error } = await supabase
      .from("menu_items")
      .insert({ ...input, sort_order: input.sort_order ?? nextSortOrder })
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/admin/dashboard/speisekarten/${input.restaurant_id}`)
    return { success: true, data: data as MenuItem, message: "Gericht hinzugefügt" }
  } catch (error) {
    console.error("Error creating menu item:", error)
    return { success: false, error: "Fehler beim Hinzufügen des Gerichts" }
  }
}

export async function updateMenuItem(input: UpdateMenuItemInput) {
  try {
    const { id, ...updateData } = input
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("menu_items")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    return { success: true, data: data as MenuItem, message: "Gericht aktualisiert" }
  } catch (error) {
    console.error("Error updating menu item:", error)
    return { success: false, error: "Fehler beim Aktualisieren des Gerichts" }
  }
}

export async function deleteMenuItem(id: string, restaurantId: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("menu_items")
      .delete()
      .eq("id", id)

    if (error) throw error

    revalidatePath(`/admin/dashboard/speisekarten/${restaurantId}`)
    return { success: true, message: "Gericht gelöscht" }
  } catch (error) {
    console.error("Error deleting menu item:", error)
    return { success: false, error: "Fehler beim Löschen des Gerichts" }
  }
}

export async function reorderMenuItems(
  restaurantId: string,
  categoryId: string | null,
  itemIds: string[]
) {
  try {
    const supabase = await createClient()

    const updates = itemIds.map((id, index) =>
      supabase
        .from("menu_items")
        .update({ sort_order: index, category_id: categoryId })
        .eq("id", id)
    )

    await Promise.all(updates)

    revalidatePath(`/admin/dashboard/speisekarten/${restaurantId}`)
    return { success: true, message: "Reihenfolge aktualisiert" }
  } catch (error) {
    console.error("Error reordering items:", error)
    return { success: false, error: "Fehler beim Aktualisieren der Reihenfolge" }
  }
}

// ============================================
// Special Menu Actions
// ============================================

export async function getSpecialMenus(restaurantId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("special_menus")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: true })

    if (error) throw error
    return { success: true, data: data as SpecialMenu[] }
  } catch (error) {
    console.error("Error fetching special menus:", error)
    return { success: false, error: "Fehler beim Laden der Spezialmenüs" }
  }
}

export async function getSpecialMenu(id: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("special_menus")
      .select("*")
      .eq("id", id)
      .single()

    if (error) throw error
    return { success: true, data: data as SpecialMenu }
  } catch (error) {
    console.error("Error fetching special menu:", error)
    return { success: false, error: "Spezialmenü nicht gefunden" }
  }
}

export async function createSpecialMenu(input: CreateSpecialMenuInput) {
  try {
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from("special_menus")
      .select("sort_order")
      .eq("restaurant_id", input.restaurant_id)
      .order("sort_order", { ascending: false })
      .limit(1)

    const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    const { data, error } = await supabase
      .from("special_menus")
      .insert({ ...input, sort_order: input.sort_order ?? nextSortOrder })
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/admin/dashboard/speisekarten/${input.restaurant_id}`)
    return { success: true, data: data as SpecialMenu, message: "Spezialmenü erstellt" }
  } catch (error) {
    console.error("Error creating special menu:", error)
    return { success: false, error: "Fehler beim Erstellen des Spezialmenüs" }
  }
}

export async function updateSpecialMenu(input: UpdateSpecialMenuInput) {
  try {
    const { id, ...updateData } = input
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("special_menus")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    return { success: true, data: data as SpecialMenu, message: "Spezialmenü aktualisiert" }
  } catch (error) {
    console.error("Error updating special menu:", error)
    return { success: false, error: "Fehler beim Aktualisieren des Spezialmenüs" }
  }
}

export async function deleteSpecialMenu(id: string, restaurantId: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("special_menus")
      .delete()
      .eq("id", id)

    if (error) throw error

    revalidatePath(`/admin/dashboard/speisekarten/${restaurantId}`)
    return { success: true, message: "Spezialmenü gelöscht" }
  } catch (error) {
    console.error("Error deleting special menu:", error)
    return { success: false, error: "Fehler beim Löschen des Spezialmenüs" }
  }
}

// ============================================
// Special Menu Category Actions
// ============================================

export async function getSpecialMenuCategories(specialMenuId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("special_menu_categories")
      .select("*")
      .eq("special_menu_id", specialMenuId)
      .order("sort_order", { ascending: true })

    if (error) throw error
    return { success: true, data: data as SpecialMenuCategory[] }
  } catch (error) {
    console.error("Error fetching special menu categories:", error)
    return { success: false, error: "Fehler beim Laden der Kategorien" }
  }
}

export async function createSpecialMenuCategory(input: CreateSpecialMenuCategoryInput) {
  try {
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from("special_menu_categories")
      .select("sort_order")
      .eq("special_menu_id", input.special_menu_id)
      .order("sort_order", { ascending: false })
      .limit(1)

    const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    const { data, error } = await supabase
      .from("special_menu_categories")
      .insert({ ...input, sort_order: input.sort_order ?? nextSortOrder })
      .select()
      .single()

    if (error) throw error

    return { success: true, data: data as SpecialMenuCategory, message: "Kategorie erstellt" }
  } catch (error) {
    console.error("Error creating special menu category:", error)
    return { success: false, error: "Fehler beim Erstellen der Kategorie" }
  }
}

export async function updateSpecialMenuCategory(input: UpdateSpecialMenuCategoryInput) {
  try {
    const { id, ...updateData } = input
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("special_menu_categories")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    return { success: true, data: data as SpecialMenuCategory, message: "Kategorie aktualisiert" }
  } catch (error) {
    console.error("Error updating special menu category:", error)
    return { success: false, error: "Fehler beim Aktualisieren der Kategorie" }
  }
}

export async function deleteSpecialMenuCategory(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("special_menu_categories")
      .delete()
      .eq("id", id)

    if (error) throw error

    return { success: true, message: "Kategorie gelöscht" }
  } catch (error) {
    console.error("Error deleting special menu category:", error)
    return { success: false, error: "Fehler beim Löschen der Kategorie" }
  }
}

export async function reorderSpecialMenuCategories(
  specialMenuId: string,
  categoryIds: string[]
) {
  try {
    const supabase = await createClient()

    const updates = categoryIds.map((id, index) =>
      supabase
        .from("special_menu_categories")
        .update({ sort_order: index })
        .eq("id", id)
    )

    await Promise.all(updates)

    return { success: true, message: "Reihenfolge aktualisiert" }
  } catch (error) {
    console.error("Error reordering special menu categories:", error)
    return { success: false, error: "Fehler beim Aktualisieren der Reihenfolge" }
  }
}

// ============================================
// Special Menu Item Actions
// ============================================

export async function getSpecialMenuItems(specialMenuId: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("special_menu_items")
      .select("*")
      .eq("special_menu_id", specialMenuId)
      .order("sort_order", { ascending: true })

    if (error) throw error
    return { success: true, data: data as SpecialMenuItem[] }
  } catch (error) {
    console.error("Error fetching special menu items:", error)
    return { success: false, error: "Fehler beim Laden der Gerichte" }
  }
}

export async function createSpecialMenuItem(input: CreateSpecialMenuItemInput) {
  try {
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from("special_menu_items")
      .select("sort_order")
      .eq("special_menu_id", input.special_menu_id)
      .eq("category_id", input.category_id ?? null)
      .order("sort_order", { ascending: false })
      .limit(1)

    const nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    const { data, error } = await supabase
      .from("special_menu_items")
      .insert({ ...input, sort_order: input.sort_order ?? nextSortOrder })
      .select()
      .single()

    if (error) throw error

    return { success: true, data: data as SpecialMenuItem, message: "Gericht hinzugefügt" }
  } catch (error) {
    console.error("Error creating special menu item:", error)
    return { success: false, error: "Fehler beim Hinzufügen des Gerichts" }
  }
}

export async function updateSpecialMenuItem(input: UpdateSpecialMenuItemInput) {
  try {
    const { id, ...updateData } = input
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("special_menu_items")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    return { success: true, data: data as SpecialMenuItem, message: "Gericht aktualisiert" }
  } catch (error) {
    console.error("Error updating special menu item:", error)
    return { success: false, error: "Fehler beim Aktualisieren des Gerichts" }
  }
}

export async function deleteSpecialMenuItem(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("special_menu_items")
      .delete()
      .eq("id", id)

    if (error) throw error

    return { success: true, message: "Gericht gelöscht" }
  } catch (error) {
    console.error("Error deleting special menu item:", error)
    return { success: false, error: "Fehler beim Löschen des Gerichts" }
  }
}

export async function reorderSpecialMenuItems(
  specialMenuId: string,
  categoryId: string | null,
  itemIds: string[]
) {
  try {
    const supabase = await createClient()

    const updates = itemIds.map((id, index) =>
      supabase
        .from("special_menu_items")
        .update({ sort_order: index, category_id: categoryId })
        .eq("id", id)
    )

    await Promise.all(updates)

    return { success: true, message: "Reihenfolge aktualisiert" }
  } catch (error) {
    console.error("Error reordering special menu items:", error)
    return { success: false, error: "Fehler beim Aktualisieren der Reihenfolge" }
  }
}
