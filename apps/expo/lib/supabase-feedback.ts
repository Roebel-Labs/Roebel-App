import { supabase } from './supabase';
import { FeedbackRecord } from './types';

/**
 * Submit feedback to Supabase
 */
export async function submitFeedback(feedback: Omit<FeedbackRecord, 'id' | 'created_at' | 'updated_at' | 'status'>) {
  const { data, error } = await supabase
    .from('feedback')
    .insert({
      ...feedback,
      status: 'new',
    })
    .select()
    .single();

  if (error) {
    console.error('Error submitting feedback:', error);
    throw error;
  }

  return data as FeedbackRecord;
}

/**
 * Get feedback by user wallet address
 */
export async function getFeedbackByUser(walletAddress: string) {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .eq('user_wallet_address', walletAddress)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user feedback:', error);
    throw error;
  }

  return data as FeedbackRecord[];
}

/**
 * Get feedback statistics
 */
export async function getFeedbackStats() {
  const { data, error } = await supabase
    .from('feedback')
    .select('feedback_type, status');

  if (error) {
    console.error('Error fetching feedback stats:', error);
    throw error;
  }

  // Calculate statistics
  const stats = {
    total: data.length,
    byType: {
      bug_report: data.filter(f => f.feedback_type === 'bug_report').length,
      feature_request: data.filter(f => f.feedback_type === 'feature_request').length,
      improvement: data.filter(f => f.feedback_type === 'improvement').length,
      general: data.filter(f => f.feedback_type === 'general').length,
    },
    byStatus: {
      new: data.filter(f => f.status === 'new').length,
      in_review: data.filter(f => f.status === 'in_review').length,
      resolved: data.filter(f => f.status === 'resolved').length,
      closed: data.filter(f => f.status === 'closed').length,
    },
  };

  return stats;
}
