import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file.');
}

const isValidUrl = supabaseUrl && supabaseUrl.startsWith('https://') && supabaseUrl.includes('.supabase.co');
const isValidKey = supabaseAnonKey && supabaseAnonKey.length > 0;

let supabase: SupabaseClient;

try {
  if (isValidUrl && isValidKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: true,
      },
    });
  } else {
    supabase = createClient(
      'https://abcdefghijklmnop.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      {
        auth: {
          persistSession: false,
          detectSessionInUrl: false,
          autoRefreshToken: false,
        },
      }
    );
  }
} catch (error) {
  console.error('Failed to initialize Supabase client:', error);
  supabase = createClient(
    'https://abcdefghijklmnop.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    {
      auth: {
        persistSession: false,
        detectSessionInUrl: false,
        autoRefreshToken: false,
      },
    }
  );
}

export { supabase };

export type Profile = {
  id: string;
  email: string;
  role: 'guest' | 'premium' | 'admin';
  is_premium?: boolean;
  display_name?: string;
  created_at: string;
  updated_at: string;
  preferences?: Record<string, any>;
};

export type FavoriteList = {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type Favorite = {
  user_id: string;
  symbol: string;
  list_id?: string;
  created_at: string;
};

export type SavedScreener = {
  id: string;
  user_id: string;
  name: string;
  filters: Record<string, any>;
  weights: {
    yield: number;
    stdDev: number;
    totalReturn: number;
  };
  created_at: string;
};

