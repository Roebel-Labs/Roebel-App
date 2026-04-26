/**
 * Org blog articles data layer.
 * Mirrors the shape of admin's news_articles helpers but scoped by account_id.
 */

import { supabase } from "./supabase";
import type { Account } from "@/types/account";

export interface BlogArticle {
  id: string;
  account_id: string;
  author_account_id: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  category: string | null;
  tags: string[];
  status: "draft" | "published" | "archived";
  is_featured: boolean;
  view_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogArticleWithAccount extends BlogArticle {
  account: Pick<
    Account,
    "id" | "name" | "slug" | "avatar_url" | "sub_type" | "is_verified" | "is_extern" | "extern_status"
  >;
}

// ── Reads ────────────────────────────────────────────────────

export async function listForAccount(
  accountId: string,
  opts: { status?: BlogArticle["status"] } = {}
): Promise<BlogArticle[]> {
  let q = supabase
    .from("blog_articles")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (opts.status) q = q.eq("status", opts.status);

  const { data, error } = await q;
  if (error) {
    console.error("listForAccount error:", error);
    return [];
  }
  return (data || []) as BlogArticle[];
}

export async function getBlogArticleById(
  id: string
): Promise<BlogArticle | null> {
  const { data, error } = await supabase
    .from("blog_articles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getBlogArticleById error:", error);
    return null;
  }
  return (data as BlogArticle) ?? null;
}
