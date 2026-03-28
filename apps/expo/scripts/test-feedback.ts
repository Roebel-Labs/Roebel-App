/**
 * Test script for feedback feature
 *
 * This script tests the feedback submission functionality
 * Run with: npx ts-node scripts/test-feedback.ts
 */

import { supabase } from '../lib/supabase';

async function testFeedbackFeature() {
  console.log('🧪 Testing Feedback Feature...\n');

  try {
    // Test 1: Check if feedback table exists
    console.log('Test 1: Checking if feedback table exists...');
    const { data: tableCheck, error: tableError } = await supabase
      .from('feedback')
      .select('count')
      .limit(1);

    if (tableError) {
      console.error('❌ Feedback table not found:', tableError.message);
      return;
    }
    console.log('✅ Feedback table exists\n');

    // Test 2: Insert a test feedback
    console.log('Test 2: Inserting test feedback...');
    const testFeedback = {
      user_wallet_address: null,
      feedback_type: 'general',
      subject: 'Test Feedback',
      message: 'This is a test feedback submission to verify the system is working.',
      contact_email: 'test@example.com',
      contact_phone: null,
      device_info: {
        os: 'test',
        appVersion: '1.0.0',
        deviceModel: 'Test Device'
      },
      status: 'new'
    };

    const { data: insertData, error: insertError } = await supabase
      .from('feedback')
      .insert(testFeedback)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to insert feedback:', insertError.message);
      return;
    }
    console.log('✅ Test feedback inserted successfully');
    console.log('   ID:', insertData.id);
    console.log('   Created at:', insertData.created_at, '\n');

    // Test 3: Retrieve the feedback
    console.log('Test 3: Retrieving feedback...');
    const { data: selectData, error: selectError } = await supabase
      .from('feedback')
      .select('*')
      .eq('id', insertData.id)
      .single();

    if (selectError) {
      console.error('❌ Failed to retrieve feedback:', selectError.message);
      return;
    }
    console.log('✅ Feedback retrieved successfully');
    console.log('   Subject:', selectData.subject);
    console.log('   Type:', selectData.feedback_type);
    console.log('   Status:', selectData.status, '\n');

    // Test 4: Update feedback status
    console.log('Test 4: Updating feedback status...');
    const { data: updateData, error: updateError } = await supabase
      .from('feedback')
      .update({ status: 'in_review' })
      .eq('id', insertData.id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Failed to update feedback:', updateError.message);
      return;
    }
    console.log('✅ Feedback status updated successfully');
    console.log('   New status:', updateData.status);
    console.log('   Updated at:', updateData.updated_at, '\n');

    // Test 5: Get feedback statistics
    console.log('Test 5: Getting feedback statistics...');
    const { data: allFeedback, error: statsError } = await supabase
      .from('feedback')
      .select('feedback_type, status');

    if (statsError) {
      console.error('❌ Failed to get statistics:', statsError.message);
      return;
    }

    const stats = {
      total: allFeedback.length,
      byType: {
        bug_report: allFeedback.filter(f => f.feedback_type === 'bug_report').length,
        feature_request: allFeedback.filter(f => f.feedback_type === 'feature_request').length,
        improvement: allFeedback.filter(f => f.feedback_type === 'improvement').length,
        general: allFeedback.filter(f => f.feedback_type === 'general').length,
      },
      byStatus: {
        new: allFeedback.filter(f => f.status === 'new').length,
        in_review: allFeedback.filter(f => f.status === 'in_review').length,
        resolved: allFeedback.filter(f => f.status === 'resolved').length,
        closed: allFeedback.filter(f => f.status === 'closed').length,
      }
    };

    console.log('✅ Statistics retrieved successfully');
    console.log('   Total feedback:', stats.total);
    console.log('   Bug reports:', stats.byType.bug_report);
    console.log('   Feature requests:', stats.byType.feature_request);
    console.log('   Improvements:', stats.byType.improvement);
    console.log('   General:', stats.byType.general);
    console.log('   Status breakdown:', stats.byStatus, '\n');

    // Test 6: Clean up test data
    console.log('Test 6: Cleaning up test data...');
    const { error: deleteError } = await supabase
      .from('feedback')
      .delete()
      .eq('id', insertData.id);

    if (deleteError) {
      console.error('❌ Failed to delete test feedback:', deleteError.message);
      console.log('   Please manually delete feedback with ID:', insertData.id);
      return;
    }
    console.log('✅ Test data cleaned up successfully\n');

    console.log('🎉 All tests passed! Feedback feature is working correctly.');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the tests
testFeedbackFeature();
