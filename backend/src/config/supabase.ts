import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

export let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });
    console.log(`[Supabase] Initialized client for ${supabaseUrl}`);
  } catch (err: any) {
    console.warn(`[Supabase] Failed to initialize client: ${err.message}`);
    supabase = null;
  }
} else {
  console.log('[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in environment.');
}
