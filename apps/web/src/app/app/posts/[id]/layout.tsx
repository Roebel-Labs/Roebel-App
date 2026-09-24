import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

/**
 * Link-preview metadata for shared post links (the app shares
 * https://www.roebel.app/app/posts/<id>). The page itself is a client
 * component, so the server-side <head> lives here. Messengers read these
 * og: tags; on a phone with the app, the same URL opens the post natively.
 */

const SITE = "https://www.roebel.app";
const FALLBACK_IMAGE = `${SITE}/logo.png`;

type PostMeta = {
  content: string | null;
  media_urls: string[] | null;
  video_url: string | null;
  status: string;
  author: { username: string | null; display_name: string | null } | null;
  account: { name: string | null } | null;
  links: { og_image: string | null }[] | null;
};

function authorName(post: PostMeta): string {
  const raw =
    post.account?.name?.trim() ||
    post.author?.display_name?.trim() ||
    post.author?.username?.trim() ||
    "";
  return raw && !/^0x[a-fA-F0-9]{40}$/.test(raw) ? raw : "Röbel App";
}

function previewImage(post: PostMeta): string {
  const image = post.media_urls?.find(Boolean);
  if (image) return image;
  const stream = post.video_url?.match(/^(https:\/\/customer-[^/]+\.cloudflarestream\.com\/[a-f0-9]+)\//i);
  if (stream) return `${stream[1]}/thumbnails/thumbnail.jpg?time=3s&height=630`;
  const linkImage = post.links?.find((l) => l.og_image)?.og_image;
  return linkImage ?? FALLBACK_IMAGE;
}

function excerpt(text: string, max: number): string {
  const clean = text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const url = `${SITE}/app/posts/${id}`;
  const fallback: Metadata = { title: "Beitrag · Röbel App", alternates: { canonical: url } };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fallback;

  try {
    const supabase = await createClient();
    const { data: post } = await supabase
      .from("posts")
      .select(
        "content, media_urls, video_url, status, author:users!posts_wallet_address_fkey(username, display_name), account:accounts!posts_account_id_fkey(name), links:post_links(og_image)",
      )
      .eq("id", id)
      .maybeSingle<PostMeta>();
    if (!post || post.status !== "published") return fallback;

    const name = authorName(post);
    const title = `${name} auf Röbel`;
    const description = excerpt(post.content ?? "", 200) || "Beitrag in der Röbel App";
    const image = previewImage(post);

    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        type: "article",
        url,
        siteName: "Röbel App",
        locale: "de_DE",
        title,
        description,
        images: [{ url: image }],
      },
      twitter: {
        card: image === FALLBACK_IMAGE ? "summary" : "summary_large_image",
        title,
        description,
        images: [image],
      },
    };
  } catch {
    return fallback;
  }
}

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
