import { createClient } from '@supabase/supabase-js';

const getEnvVar = (key: string, fallback: string) => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {
    // Ignore ReferenceError in browser
  }
  return fallback;
};

const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL', getEnvVar('SUPABASE_URL', 'https://vfvaemlbybsidmyvrxgu.supabase.co'));
const supabaseAnonKey = getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY', getEnvVar('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_vhx6VWd5wCywMjDNijmJDQ_Dc5s9KOx'));

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
