"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type {
  ProposalCommentFeedItem,
  ProposalPreviewRef,
  CreateProposalCommentInput,
} from "@/types/post"

const PAGE_SIZE = 10

interface CommentRow {
  id: string
  proposal_id: string
  wallet_address: string
  account_id: string | null
  content: string
  media_urls: string[] | null
  video_url: string | null
  emoji: string | null
  status: string
  created_at: string
}

interface AuthorRow {
  wallet_address: string
  username: string | null
  profile_picture_url: string | null
}

interface AccountRow {
  id: string
  name: string | null
  avatar_url: string | null
}

interface ProposalRow {
  proposal_id: string
  proposal_number: number | null
  title: string
  state: number
  for_votes: string
  against_votes: string
  abstain_votes: string
}

async function joinAuthorsAndAccounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: CommentRow[]
): Promise<{
  authorMap: Map<string, AuthorRow>
  accountMap: Map<string, AccountRow>
}> {
  const authorMap = new Map<string, AuthorRow>()
  const accountMap = new Map<string, AccountRow>()

  if (rows.length === 0) return { authorMap, accountMap }

  const wallets = [...new Set(rows.map((r) => r.wallet_address))]
  if (wallets.length > 0) {
    const { data: authors } = await supabase
      .from("users")
      .select("wallet_address, username, profile_picture_url")
      .in("wallet_address", wallets)
    for (const a of (authors as AuthorRow[]) || []) {
      authorMap.set(a.wallet_address, a)
    }
  }

  const accountIds = [...new Set(rows.map((r) => r.account_id).filter(Boolean) as string[])]
  if (accountIds.length > 0) {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, name, avatar_url")
      .in("id", accountIds)
    for (const acc of (accounts as AccountRow[]) || []) {
      accountMap.set(acc.id, acc)
    }
  }

  return { authorMap, accountMap }
}

function mapToFeedItem(
  row: CommentRow,
  authorMap: Map<string, AuthorRow>,
  accountMap: Map<string, AccountRow>,
  proposal: ProposalPreviewRef | null
): ProposalCommentFeedItem {
  const author = authorMap.get(row.wallet_address)
  const account = row.account_id ? accountMap.get(row.account_id) : null
  return {
    id: row.id,
    proposal_id: row.proposal_id,
    wallet_address: row.wallet_address,
    account_id: row.account_id,
    content: row.content,
    media_urls: row.media_urls || [],
    video_url: row.video_url,
    emoji: row.emoji,
    status: row.status as "published" | "deleted",
    created_at: row.created_at,
    author_username: author?.username || null,
    author_profile_picture_url: author?.profile_picture_url || null,
    author_account_name: account?.name || null,
    author_account_avatar_url: account?.avatar_url || null,
    proposal,
  }
}

export async function fetchProposalComments(
  proposalId: string,
  page = 0,
  viewerWallet?: string,
  pageSize: number = PAGE_SIZE
): Promise<{ data: (ProposalCommentFeedItem & { likes_count: number; is_liked: boolean })[]; hasMore: boolean }> {
  const supabase = await createClient()
  const from = page * pageSize
  const to = from + pageSize - 1

  const { data, error } = await supabase
    .from("proposal_comments")
    .select("*")
    .eq("proposal_id", proposalId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(from, to)

  if (error) {
    console.error("Error fetching proposal comments:", error)
    return { data: [], hasMore: false }
  }

  const rows = (data as CommentRow[]) || []
  const { authorMap, accountMap } = await joinAuthorsAndAccounts(supabase, rows)
  const items = rows.map((r) => mapToFeedItem(r, authorMap, accountMap, null))

  const ids = items.map((i) => i.id)
  const counts = new Map<string, number>()
  const likedSet = new Set<string>()

  if (ids.length > 0) {
    const { data: likeRows } = await supabase
      .from("proposal_comment_likes")
      .select("comment_id, wallet_address")
      .in("comment_id", ids)

    for (const lr of (likeRows as { comment_id: string; wallet_address: string }[]) || []) {
      counts.set(lr.comment_id, (counts.get(lr.comment_id) || 0) + 1)
      if (viewerWallet && lr.wallet_address === viewerWallet.toLowerCase()) {
        likedSet.add(lr.comment_id)
      }
    }
  }

  const decorated = items.map((c) => ({
    ...c,
    likes_count: counts.get(c.id) || 0,
    is_liked: likedSet.has(c.id),
  }))

  return { data: decorated, hasMore: rows.length === pageSize }
}

export async function createProposalComment(
  input: CreateProposalCommentInput
): Promise<{ success: boolean; data?: ProposalCommentFeedItem; error?: string }> {
  try {
    const supabase = await createClient()
    const wallet = input.wallet_address.toLowerCase()

    const { data, error } = await supabase
      .from("proposal_comments")
      .insert({
        proposal_id: input.proposal_id,
        wallet_address: wallet,
        account_id: input.account_id || null,
        content: input.content,
        media_urls: input.media_urls || [],
        video_url: input.video_url || null,
        emoji: input.emoji || null,
        status: "published",
      })
      .select("*")
      .single()

    if (error || !data) throw error

    const row = data as CommentRow
    const { authorMap, accountMap } = await joinAuthorsAndAccounts(supabase, [row])

    revalidatePath(`/app/proposals/${input.proposal_id}`)
    revalidatePath("/app")

    return {
      success: true,
      data: mapToFeedItem(row, authorMap, accountMap, null),
    }
  } catch (error) {
    console.error("Error creating proposal comment:", error)
    return { success: false, error: "Fehler beim Erstellen des Kommentars" }
  }
}

export async function fetchRecentProposalComments(
  limit = 30
): Promise<ProposalCommentFeedItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("proposal_comments")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("Error fetching recent proposal comments:", error)
    return []
  }

  const rows = (data as CommentRow[]) || []
  if (rows.length === 0) return []

  const { authorMap, accountMap } = await joinAuthorsAndAccounts(supabase, rows)

  const proposalIds = [...new Set(rows.map((r) => r.proposal_id))]
  const proposalMap = new Map<string, ProposalPreviewRef>()
  if (proposalIds.length > 0) {
    const { data: proposals } = await supabase
      .from("proposals")
      .select("proposal_id, proposal_number, title, state, for_votes, against_votes, abstain_votes")
      .in("proposal_id", proposalIds)
    for (const p of (proposals as ProposalRow[]) || []) {
      proposalMap.set(p.proposal_id, {
        proposal_id: p.proposal_id,
        proposal_number: p.proposal_number,
        title: p.title,
        state: p.state,
        for_votes: p.for_votes,
        against_votes: p.against_votes,
        abstain_votes: p.abstain_votes,
      })
    }
  }

  return rows.map((r) =>
    mapToFeedItem(r, authorMap, accountMap, proposalMap.get(r.proposal_id) || null)
  )
}

export async function toggleProposalCommentLike(
  commentId: string,
  walletAddress: string
): Promise<{ success: boolean; data?: { liked: boolean; newCount: number }; error?: string }> {
  try {
    const supabase = await createClient()
    const wallet = walletAddress.toLowerCase()

    const { data: existing } = await supabase
      .from("proposal_comment_likes")
      .select("id")
      .eq("comment_id", commentId)
      .eq("wallet_address", wallet)
      .maybeSingle()

    if (existing) {
      await supabase.from("proposal_comment_likes").delete().eq("id", existing.id)
    } else {
      await supabase
        .from("proposal_comment_likes")
        .insert({ comment_id: commentId, wallet_address: wallet })
    }

    const { count } = await supabase
      .from("proposal_comment_likes")
      .select("comment_id", { count: "exact", head: true })
      .eq("comment_id", commentId)

    return {
      success: true,
      data: { liked: !existing, newCount: count || 0 },
    }
  } catch (error) {
    console.error("Error toggling proposal comment like:", error)
    return { success: false, error: "Fehler beim Liken" }
  }
}

export async function deleteProposalComment(
  commentId: string,
  walletAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const wallet = walletAddress.toLowerCase()

    const { data: comment } = await supabase
      .from("proposal_comments")
      .select("id, wallet_address, proposal_id")
      .eq("id", commentId)
      .single()

    if (!comment) return { success: false, error: "Kommentar nicht gefunden" }
    if (comment.wallet_address !== wallet) {
      return { success: false, error: "Keine Berechtigung zum Löschen" }
    }

    const { error } = await supabase
      .from("proposal_comments")
      .update({ status: "deleted" })
      .eq("id", commentId)

    if (error) throw error

    revalidatePath(`/app/proposals/${comment.proposal_id}`)
    return { success: true }
  } catch (error) {
    console.error("Error deleting proposal comment:", error)
    return { success: false, error: "Fehler beim Löschen" }
  }
}
