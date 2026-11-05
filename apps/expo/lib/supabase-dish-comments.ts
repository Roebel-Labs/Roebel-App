import { supabase } from './supabase';

/** A dish is either a regular menu item or a Mittagstisch dish. */
export type DishTarget = { kind: 'menu_item' | 'special_menu_item'; id: string };

export type DishComment = {
  id: string;
  content: string;
  created_at: string;
  wallet_address: string;
  author: {
    username: string | null;
    profile_picture_url: string | null;
    is_verified_citizen: boolean | null;
  } | null;
};

const SELECT = `
  id, content, created_at, wallet_address,
  author:users!dish_comments_wallet_address_fkey(username, profile_picture_url, is_verified_citizen)
`;

const targetColumn = (target: DishTarget) =>
  target.kind === 'menu_item' ? 'menu_item_id' : 'special_menu_item_id';

export async function fetchDishComments(target: DishTarget, limit = 50): Promise<DishComment[]> {
  const { data, error } = await supabase
    .from('dish_comments')
    .select(SELECT)
    .eq(targetColumn(target), target.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('Error fetching dish comments:', error);
    return [];
  }
  return (data ?? []) as unknown as DishComment[];
}

export async function createDishComment(
  target: DishTarget,
  walletAddress: string,
  content: string,
): Promise<DishComment | null> {
  const { data, error } = await supabase
    .from('dish_comments')
    .insert({ [targetColumn(target)]: target.id, wallet_address: walletAddress, content: content.trim() })
    .select(SELECT)
    .single();
  if (error) {
    console.error('Error creating dish comment:', error);
    return null;
  }
  return data as unknown as DishComment;
}
