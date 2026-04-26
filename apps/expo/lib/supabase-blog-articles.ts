import { supabase } from './supabase';
import type { Account, BlogArticle } from './types';

export type BlogArticleWithAccount = BlogArticle & {
  account: Pick<
    Account,
    'id' | 'name' | 'slug' | 'avatar_url' | 'sub_type' | 'is_verified' | 'is_extern' | 'extern_status'
  > | null;
};

function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function uniqueSlug(
  accountId: string,
  base: string,
  excludeId?: string
): Promise<string> {
  const baseSlug = base || 'artikel';
  let slug = baseSlug;
  let n = 1;
  while (true) {
    let q = supabase
      .from('blog_articles' as any)
      .select('id')
      .eq('account_id', accountId)
      .eq('slug', slug)
      .limit(1);
    if (excludeId) q = q.neq('id', excludeId);
    const { data } = await q;
    if (!data || (data as any[]).length === 0) return slug;
    n += 1;
    slug = `${baseSlug}-${n}`;
  }
}

// ── Reads ────────────────────────────────────────────────────

export async function listPublishedFeed(limit = 60): Promise<BlogArticleWithAccount[]> {
  const { data, error } = await supabase
    .from('blog_articles' as any)
    .select(
      `
      id, account_id, author_account_id, title, slug, excerpt, content,
      cover_image_url, category, tags, status, is_featured, view_count,
      published_at, created_at, updated_at,
      account:account_id (
        id, name, slug, avatar_url, sub_type, is_verified, is_extern, extern_status
      )
    `
    )
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listPublishedFeed error:', error);
    return [];
  }

  // Hide pending/rejected extern orgs
  return ((data as unknown) as BlogArticleWithAccount[]).filter(
    (a) => !a.account || !a.account.is_extern || a.account.extern_status === 'approved'
  );
}

export async function getBlogArticleById(id: string): Promise<BlogArticleWithAccount | null> {
  const { data, error } = await supabase
    .from('blog_articles' as any)
    .select(
      `
      id, account_id, author_account_id, title, slug, excerpt, content,
      cover_image_url, category, tags, status, is_featured, view_count,
      published_at, created_at, updated_at,
      account:account_id (
        id, name, slug, avatar_url, sub_type, is_verified, is_extern, extern_status
      )
    `
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('getBlogArticleById error:', error);
    return null;
  }
  return data as unknown as BlogArticleWithAccount | null;
}

export async function listForAccount(
  accountId: string
): Promise<BlogArticle[]> {
  const { data, error } = await supabase
    .from('blog_articles' as any)
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('listForAccount error:', error);
    return [];
  }
  return (data || []) as BlogArticle[];
}

export async function incrementViewCount(id: string): Promise<void> {
  const { error } = await supabase.rpc('increment_blog_view_count', { article_id: id });
  if (error) console.error('incrementViewCount error:', error);
}

// ── Writes (org member, app-layer permission check) ───────────

async function assertCanWrite(
  accountId: string,
  walletAddress: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: account } = await supabase
    .from('accounts' as any)
    .select('id, account_type, is_extern, extern_status')
    .eq('id', accountId)
    .maybeSingle();

  if (!account) return { ok: false, error: 'Konto nicht gefunden' };
  if ((account as any).account_type !== 'organisation') {
    return { ok: false, error: 'Nur Organisationskonten dürfen Artikel veröffentlichen' };
  }
  if ((account as any).is_extern && (account as any).extern_status !== 'approved') {
    return { ok: false, error: 'Externes Konto wartet auf Freigabe' };
  }

  const { data: owner } = await supabase
    .from('account_owners' as any)
    .select('role')
    .eq('account_id', accountId)
    .eq('wallet_address', walletAddress.toLowerCase())
    .maybeSingle();

  if (!owner) return { ok: false, error: 'Keine Berechtigung für diese Organisation' };
  const role = (owner as any).role;
  if (role !== 'owner' && role !== 'admin') {
    return { ok: false, error: 'Nur Inhaber:innen oder Admins dürfen veröffentlichen' };
  }
  return { ok: true };
}

export type BlogArticleInput = {
  account_id: string;
  wallet_address: string;
  author_account_id?: string | null;
  title: string;
  excerpt?: string | null;
  content: string; // HTML
  cover_image_url?: string | null;
  category?: string | null;
  tags?: string[];
  status: 'draft' | 'published';
};

export async function createBlogArticle(
  input: BlogArticleInput
): Promise<{ success: true; data: BlogArticle } | { success: false; error: string }> {
  const guard = await assertCanWrite(input.account_id, input.wallet_address);
  if (!guard.ok) return { success: false, error: guard.error };

  const slug = await uniqueSlug(input.account_id, generateSlug(input.title));
  const published_at = input.status === 'published' ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from('blog_articles' as any)
    .insert({
      account_id: input.account_id,
      author_account_id: input.author_account_id ?? null,
      title: input.title,
      slug,
      excerpt: input.excerpt ?? null,
      content: input.content,
      cover_image_url: input.cover_image_url ?? null,
      category: input.category ?? null,
      tags: input.tags ?? [],
      status: input.status,
      published_at,
    })
    .select()
    .single();

  if (error) {
    console.error('createBlogArticle error:', error);
    return { success: false, error: 'Fehler beim Erstellen' };
  }
  return { success: true, data: data as BlogArticle };
}

export async function updateBlogArticle(
  id: string,
  input: BlogArticleInput
): Promise<{ success: true; data: BlogArticle } | { success: false; error: string }> {
  const guard = await assertCanWrite(input.account_id, input.wallet_address);
  if (!guard.ok) return { success: false, error: guard.error };

  const { data: current } = await supabase
    .from('blog_articles' as any)
    .select('status, published_at, account_id')
    .eq('id', id)
    .maybeSingle();

  if (!current || (current as any).account_id !== input.account_id) {
    return { success: false, error: 'Artikel nicht gefunden' };
  }

  const slug = await uniqueSlug(input.account_id, generateSlug(input.title), id);
  const published_at =
    input.status === 'published' && (current as any).status !== 'published'
      ? new Date().toISOString()
      : (current as any).published_at;

  const { data, error } = await supabase
    .from('blog_articles' as any)
    .update({
      title: input.title,
      slug,
      excerpt: input.excerpt ?? null,
      content: input.content,
      cover_image_url: input.cover_image_url ?? null,
      category: input.category ?? null,
      tags: input.tags ?? [],
      status: input.status,
      published_at,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('updateBlogArticle error:', error);
    return { success: false, error: 'Fehler beim Aktualisieren' };
  }
  return { success: true, data: data as BlogArticle };
}

export async function setBlogArticleStatus(
  id: string,
  accountId: string,
  walletAddress: string,
  status: 'draft' | 'published' | 'archived'
): Promise<{ success: boolean; error?: string }> {
  const guard = await assertCanWrite(accountId, walletAddress);
  if (!guard.ok) return { success: false, error: guard.error };

  const { data: current } = await supabase
    .from('blog_articles' as any)
    .select('status, published_at')
    .eq('id', id)
    .maybeSingle();

  if (!current) return { success: false, error: 'Artikel nicht gefunden' };

  const published_at =
    status === 'published' && (current as any).status !== 'published'
      ? new Date().toISOString()
      : (current as any).published_at;

  const { error } = await supabase
    .from('blog_articles' as any)
    .update({ status, published_at })
    .eq('id', id)
    .eq('account_id', accountId);

  if (error) {
    console.error('setBlogArticleStatus error:', error);
    return { success: false, error: 'Fehler beim Aktualisieren' };
  }
  return { success: true };
}

export async function deleteBlogArticle(
  id: string,
  accountId: string,
  walletAddress: string
): Promise<{ success: boolean; error?: string }> {
  const guard = await assertCanWrite(accountId, walletAddress);
  if (!guard.ok) return { success: false, error: guard.error };

  const { error } = await supabase
    .from('blog_articles' as any)
    .delete()
    .eq('id', id)
    .eq('account_id', accountId);

  if (error) {
    console.error('deleteBlogArticle error:', error);
    return { success: false, error: 'Fehler beim Löschen' };
  }
  return { success: true };
}

// ── Plain-text → HTML helper ──────────────────────────────────
//
// Mobile composer is intentionally plain text. We convert paragraph breaks
// to <p> tags so the same RichTextRenderer used for web Tiptap output
// works without changes. Web-side editing remains rich.
export function plainTextToHtml(plain: string): string {
  return plain
    .split(/\n\s*\n/g)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

export function htmlToPlainText(html: string): string {
  // Best-effort reverse for editing: strip tags, decode <br> as newline,
  // <p> blocks as double newlines.
  return html
    .replace(/<br\s*\/?>(?!\n)/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/?p>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
