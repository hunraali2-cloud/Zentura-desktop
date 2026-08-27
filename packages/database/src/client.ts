import { createClient } from '@supabase/supabase-js';

const getEnvVar = (key: string, fallback: string = ''): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch (e) {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {}
  return fallback;
};

const supabaseUrl =
  getEnvVar('VITE_SUPABASE_URL') ||
  getEnvVar('NEXT_PUBLIC_SUPABASE_URL') ||
  getEnvVar('SUPABASE_URL') ||
  'https://placeholder.supabase.co';

const supabaseAnonKey =
  getEnvVar('VITE_SUPABASE_ANON_KEY') ||
  getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  getEnvVar('SUPABASE_PUBLISHABLE_KEY') ||
  'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
