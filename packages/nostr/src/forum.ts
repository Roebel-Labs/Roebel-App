import { buildEvent, type NostrEvent } from "./events";

/**
 * Umfragen-Forum grammar (spec: docs/superpowers/specs/2026-08-29-umfragen-forum-design.md).
 *
 * Kind 32107 — Kategorie definition (addressable, d = "category:<slug>").
 *   Authored by the town/publisher identity, never by citizens.
 * Kind 11   — Thema (NIP-7D thread): title tag + optional t category tag.
 *   Regular immutable event: its id is a stable permalink a future NSP-12
 *   head can cite.
 * Kind 1111 — Antwort (NIP-22 comment): uppercase E/K/P = thread root scope,
 *   lowercase e/k/p = direct parent (the root itself for top-level replies).
 */
export const KIND_FORUM_CATEGORY = 32107;
export const KIND_FORUM_THREAD = 11;
export const KIND_FORUM_REPLY = 1111;

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) throw new Error(`invalid forum category slug: "${slug}"`);
}

/** The a-tag address of a category definition: `32107:<pubkey>:category:<slug>`. */
export function forumCategoryAddress(pubkeyHex: string, slug: string): string {
  assertSlug(slug);
  return `${KIND_FORUM_CATEGORY}:${pubkeyHex}:category:${slug}`;
}

export interface ForumCategoryInput {
  slug: string;
  name: string;
  about?: string;
}

export function buildForumCategoryEvent(
  secretKey: Uint8Array,
  input: ForumCategoryInput,
  options: { createdAt?: number } = {},
): NostrEvent {
  assertSlug(input.slug);
  if (!input.name.trim()) throw new Error("a forum category needs a name");
  const tags = [
    ["d", `category:${input.slug}`],
    ["name", input.name.trim()],
    ...(input.about?.trim() ? [["about", input.about.trim()]] : []),
  ];
  return buildEvent(secretKey, KIND_FORUM_CATEGORY, "", { ...options, tags });
}

export interface ForumThreadInput {
  title: string;
  content: string;
  categorySlug?: string;
}

export function buildForumThreadEvent(
  secretKey: Uint8Array,
  input: ForumThreadInput,
  options: { createdAt?: number } = {},
): NostrEvent {
  const title = input.title.trim();
  if (!title) throw new Error("a forum thread needs a title");
  if (input.categorySlug !== undefined) assertSlug(input.categorySlug);
  const tags = [
    ["title", title],
    ...(input.categorySlug ? [["t", input.categorySlug]] : []),
  ];
  return buildEvent(secretKey, KIND_FORUM_THREAD, input.content, { ...options, tags });
}

export interface ForumEventRef {
  id: string;
  pubkey: string;
}

export function buildForumReplyEvent(
  secretKey: Uint8Array,
  content: string,
  root: ForumEventRef,
  parent?: ForumEventRef & { kind: number },
  options: { createdAt?: number } = {},
): NostrEvent {
  const p = parent ?? { ...root, kind: KIND_FORUM_THREAD };
  const tags = [
    ["E", root.id, "", root.pubkey],
    ["K", String(KIND_FORUM_THREAD)],
    ["P", root.pubkey],
    ["e", p.id, "", p.pubkey],
    ["k", String(p.kind)],
    ["p", p.pubkey],
  ];
  return buildEvent(secretKey, KIND_FORUM_REPLY, content, { ...options, tags });
}
