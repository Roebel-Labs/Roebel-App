import { supabase } from './supabase';

export interface ExplorerCheckpoint {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  qr_code: string;
  points_reward: number;
  badge_image_url: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ExplorerCompletion {
  id: string;
  wallet_address: string;
  checkpoint_id: string;
  completed_at: string;
}

export async function fetchCheckpoints(): Promise<ExplorerCheckpoint[]> {
  const { data, error } = await supabase
    .from('explorer_checkpoints')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching checkpoints:', error);
    return [];
  }
  return data || [];
}

export async function fetchCompletions(walletAddress: string): Promise<ExplorerCompletion[]> {
  const { data, error } = await supabase
    .from('explorer_completions')
    .select('*')
    .eq('wallet_address', walletAddress);

  if (error) {
    console.error('Error fetching completions:', error);
    return [];
  }
  return data || [];
}

export async function completeCheckpoint(
  walletAddress: string,
  checkpointId: string
): Promise<{ success: boolean; alreadyCompleted?: boolean }> {
  // Check if already completed
  const { data: existing } = await supabase
    .from('explorer_completions')
    .select('id')
    .eq('wallet_address', walletAddress)
    .eq('checkpoint_id', checkpointId)
    .single();

  if (existing) {
    return { success: false, alreadyCompleted: true };
  }

  const { error } = await supabase
    .from('explorer_completions')
    .insert({
      wallet_address: walletAddress,
      checkpoint_id: checkpointId,
    });

  if (error) {
    console.error('Error completing checkpoint:', error);
    return { success: false };
  }

  return { success: true };
}
