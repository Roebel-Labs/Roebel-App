import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? Constants.manifest?.extra) as
  | { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string }
  | undefined;

// Fallback credentials for development (replace with your actual values)
const SUPABASE_URL = extra?.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = extra?.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'your-anon-key';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('your-project') || SUPABASE_ANON_KEY.includes('your-anon-key')) {
  console.warn('⚠️ Supabase credentials are missing or using placeholder values.');
  console.warn('App will work in offline mode but database features will be disabled.');
}

// Create client with error handling
let supabase: ReturnType<typeof createClient>;

try {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  });
} catch (error) {
  console.error('Failed to initialize Supabase client:', error);
  // Create a mock client that won't crash the app but returns proper chainable methods
  const mockQueryBuilder = {
    select: () => mockQueryBuilder,
    insert: () => mockQueryBuilder,
    update: () => mockQueryBuilder,
    delete: () => mockQueryBuilder,
    eq: () => mockQueryBuilder,
    neq: () => mockQueryBuilder,
    gt: () => mockQueryBuilder,
    gte: () => mockQueryBuilder,
    lt: () => mockQueryBuilder,
    lte: () => mockQueryBuilder,
    like: () => mockQueryBuilder,
    ilike: () => mockQueryBuilder,
    is: () => mockQueryBuilder,
    in: () => mockQueryBuilder,
    contains: () => mockQueryBuilder,
    containedBy: () => mockQueryBuilder,
    rangeGt: () => mockQueryBuilder,
    rangeGte: () => mockQueryBuilder,
    rangeLt: () => mockQueryBuilder,
    rangeLte: () => mockQueryBuilder,
    rangeAdjacent: () => mockQueryBuilder,
    overlaps: () => mockQueryBuilder,
    textSearch: () => mockQueryBuilder,
    match: () => mockQueryBuilder,
    not: () => mockQueryBuilder,
    or: () => mockQueryBuilder,
    filter: () => mockQueryBuilder,
    order: () => mockQueryBuilder,
    limit: () => mockQueryBuilder,
    range: () => mockQueryBuilder,
    abortSignal: () => mockQueryBuilder,
    single: () => mockQueryBuilder,
    maybeSingle: () => mockQueryBuilder,
    csv: () => mockQueryBuilder,
    geojson: () => mockQueryBuilder,
    explain: () => mockQueryBuilder,
    rollback: () => mockQueryBuilder,
    returns: () => mockQueryBuilder,
    then: (resolve: (value: { data: any[]; error: Error | null }) => void) => {
      // Return empty data array to prevent crashes but indicate no data available
      resolve({ data: [], error: null });
      return Promise.resolve({ data: [], error: null });
    }
  };

  supabase = {
    from: () => mockQueryBuilder,
    rpc: () => mockQueryBuilder,
    schema: () => ({ from: () => mockQueryBuilder }),
  } as any;
}

export { supabase };
