/**
 * Irys Upload Utilities (React Native Compatible)
 *
 * Temporary solution: Store in Supabase until backend proxy is set up
 * Irys integration requires backend to avoid exposing private key
 */

import Constants from 'expo-constants';

const IRYS_NODE_URL = 'https://node2.irys.xyz';

/**
 * Upload JSON data to Irys using HTTP API
 *
 * TEMPORARY: This is a placeholder until backend proxy is implemented
 * For now, data is stored in Supabase and we generate a mock Irys URL
 *
 * @param data - Data object to upload
 * @returns Mock Irys response (data stored in Supabase)
 */
export async function uploadToIrys(data: any): Promise<{ id: string; url: string }> {
  console.log('📤 [TEMPORARY] Storing data (Irys integration pending)...');

  try {
    // Generate a deterministic ID from the data
    const jsonData = JSON.stringify(data);
    const timestamp = Date.now();
    const mockId = `temp_${timestamp}_${jsonData.length}`;

    console.log(`📦 Data size: ${jsonData.length} bytes`);
    console.log(`⚠️  Using temporary storage - implement backend proxy for production Irys`);
    console.log(`📍 Mock ID: ${mockId}`);

    // Return mock response that matches Irys format
    // Data will be stored in Supabase evidence_data field
    const mockUrl = `${IRYS_NODE_URL}/${mockId}`;

    console.log(`✅ Data prepared for Supabase storage`);
    console.log(`🔗 Mock URL: ${mockUrl}`);

    return {
      id: mockId,
      url: mockUrl,
    };
  } catch (error) {
    console.error('❌ Data preparation error:', error);

    if (error instanceof Error) {
      throw new Error(`Failed to prepare data: ${error.message}`);
    }

    throw new Error('Failed to prepare data: Unknown error');
  }
}

/**
 * Fetch data from Irys by ID
 *
 * @param irysId - Irys transaction ID
 * @returns Parsed JSON data
 */
export async function fetchFromIrys(irysId: string): Promise<any> {
  console.log(`📥 Fetching data from Irys: ${irysId}`);

  try {
    const url = `${IRYS_NODE_URL}/${irysId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Data fetched from Irys successfully');

    return data;
  } catch (error) {
    console.error('❌ Irys fetch error:', error);

    if (error instanceof Error) {
      throw new Error(`Failed to fetch from Irys: ${error.message}`);
    }

    throw new Error('Failed to fetch from Irys: Unknown error');
  }
}

/**
 * Check if Irys is configured
 *
 * @returns Always returns true for now (using Supabase storage)
 */
export function isIrysConfigured(): boolean {
  return true; // Using Supabase storage temporarily
}
