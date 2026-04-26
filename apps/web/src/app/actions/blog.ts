"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateSlug } from "@/lib/slug";

export interface BlogArticleInput {
  account_id: string;
  author_account_id?: string | null;
  wallet_address: string;
  title: string;
  excerpt?: string;
  content: string;
  cover_image_url?: string;
  category?: string;
  tags?: string;
  status: "draft" | "published";
  is_featured?: boolean;
}

async function assertCanWrite(
  accountId: string,
  walletAddress: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: account, error: accErr } = await supabase
    .from("accounts")
    .select("id, account_type, is_extern, extern_status")
    .eq("id", accountId)
    .maybeSingle();

  if (accErr || !account) return { ok: false, error: "Konto nicht gefunden" };
  if (account.account_type !== "organisation") {
    return { ok: false, error: "Nur Organisationskonten dürfen Artikel veröffentlichen" };
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
    return { ok: false, error: "Nur Inhaber:innen oder Admins dürfen veröffentlichen" };
  }

  return { ok: true };
}

async function uniqueSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  base: string,
  excludeId?: string
): Promise<string> {
  const baseSlug = base || "artikel";
  let slug = baseSlug;
  let n = 1;
  while (true) {
    let q = supabase
      .from("blog_articles")
      .select("id")
      .eq("account_id", accountId)
      .eq("slug", slug)
      .limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    if (!data || data.length === 0) return slug;
    n += 1;
    slug = `${baseSlug}-${n}`;
  }
}

export async function createBlogArticle(formData: FormData) {
  try {
    const supabase = await createClient();

    const account_id = formData.get("account_id") as string;
    const author_account_id = (formData.get("author_account_id") as string) || null;
    const wallet_address = formData.get("wallet_address") as string;
    const title = formData.get("title") as string;
    const excerpt = (formData.get("excerpt") as string) || null;
    const content = formData.get("content") as string;
    const cover_image_url = (formData.get("cover_image_url") as string) || null;
    const category = (formData.get("category") as string) || null;
    const tags = formData.get("tags") as string;
    const status = formData.get("status") as "draft" | "published";
    const is_featured = formData.get("is_featured") === "true";

    if (!account_id || !wallet_address || !title || !content) {
      return { success: false, error: "Pflichtfelder fehlen" };
    }

    const guard = await assertCanWrite(account_id, wallet_address);
    if (!guard.ok) return { success: false, error: guard.error };

    const slug = await uniqueSlug(supabase, account_id, generateSlug(title));
    const published_at = status === "published" ? new Date().toISOString() : null;

    const { data, error } = await supabase
      .from("blog_articles")
      .insert({
        account_id,
        author_account_id,
        title,
        slug,
        excerpt,
        content,
        cover_image_url,
        category,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        status,
        is_featured,
        published_at,
      })
      .select()
      .single();

    if (error) throw error;

    revalidatePath("/app/org-dashboard/blog");
    revalidatePath("/app/blog");

    return { success: true, data, message: "Artikel erstellt" };
  } catch (error) {
    console.error("createBlogArticle error:", error);
    return { success: false, error: "Fehler beim Erstellen" };
  }
}

export async function updateBlogArticle(id: string, formData: FormData) {
  try {
    const supabase = await createClient();

    const account_id = formData.get("account_id") as string;
    const wallet_address = formData.get("wallet_address") as string;
    const title = formData.get("title") as string;
    const excerpt = (formData.get("excerpt") as string) || null;
    const content = formData.get("content") as string;
    const cover_image_url = (formData.get("cover_image_url") as string) || null;
    const category = (formData.get("category") as string) || null;
    const tags = formData.get("tags") as string;
    const status = formData.get("status") as "draft" | "published" | "archived";
    const is_featured = formData.get("is_featured") === "true";

    if (!account_id || !wallet_address || !title || !content) {
      return { success: false, error: "Pflichtfelder fehlen" };
    }

    const guard = await assertCanWrite(account_id, wallet_address);
    if (!guard.ok) return { success: false, error: guard.error };

    const { data: current } = await supabase
      .from("blog_articles")
      .select("status, published_at, account_id")
      .eq("id", id)
      .maybeSingle();

    if (!current || current.account_id !== account_id) {
      return { success: false, error: "Artikel nicht gefunden" };
    }

    const slug = await uniqueSlug(supabase, account_id, generateSlug(title), id);

    const published_at =
      status === "published" && current.status !== "published"
        ? new Date().toISOString()
        : current.published_at;

    const { data, error } = await supabase
      .from("blog_articles")
      .update({
        title,
        slug,
        excerpt,
        content,
        cover_image_url,
        category,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        status,
        is_featured,
        published_at,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    revalidatePath("/app/org-dashboard/blog");
    revalidatePath(`/app/blog/${id}`);
    revalidatePath("/app/blog");

    return { success: true, data, message: "Artikel aktualisiert" };
  } catch (error) {
    console.error("updateBlogArticle error:", error);
    return { success: false, error: "Fehler beim Aktualisieren" };
  }
}

export async function deleteBlogArticle(
  id: string,
  account_id: string,
  wallet_address: string
) {
  try {
    const supabase = await createClient();

    const guard = await assertCanWrite(account_id, wallet_address);
    if (!guard.ok) return { success: false, error: guard.error };

    const { error } = await supabase
      .from("blog_articles")
      .delete()
      .eq("id", id)
      .eq("account_id", account_id);

    if (error) throw error;

    revalidatePath("/app/org-dashboard/blog");
    revalidatePath("/app/blog");

    return { success: true, message: "Artikel gelöscht" };
  } catch (error) {
    console.error("deleteBlogArticle error:", error);
    return { success: false, error: "Fehler beim Löschen" };
  }
}

export async function setBlogArticleStatus(
  id: string,
  account_id: string,
  wallet_address: string,
  status: "draft" | "published" | "archived"
) {
  try {
    const supabase = await createClient();

    const guard = await assertCanWrite(account_id, wallet_address);
    if (!guard.ok) return { success: false, error: guard.error };

    const { data: current } = await supabase
      .from("blog_articles")
      .select("status, published_at")
      .eq("id", id)
      .maybeSingle();

    if (!current) return { success: false, error: "Artikel nicht gefunden" };

    const published_at =
      status === "published" && current.status !== "published"
        ? new Date().toISOString()
        : current.published_at;

    const { error } = await supabase
      .from("blog_articles")
      .update({ status, published_at })
      .eq("id", id)
      .eq("account_id", account_id);

    if (error) throw error;

    revalidatePath("/app/org-dashboard/blog");
    revalidatePath("/app/blog");

    return { success: true, message: "Status aktualisiert" };
  } catch (error) {
    console.error("setBlogArticleStatus error:", error);
    return { success: false, error: "Fehler beim Aktualisieren" };
  }
}

export async function incrementBlogViewCount(id: string) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("increment_blog_view_count", {
      article_id: id,
    });
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("incrementBlogViewCount error:", error);
    return { success: false };
  }
}
