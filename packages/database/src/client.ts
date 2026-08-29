import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://vfvaemlbybsidmyvrxgu.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmdmFlbWxieWJzaWRteXZyeGd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MTUxMzksImV4cCI6MjEwMzI5MTEzOX0.Cs4HtJivPTqAFywya4JrrSmY_Nl8E7YG3o1AmSK5_Pw';

const getEnvUrl = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env.VITE_SUPABASE_URL) return import.meta.env.VITE_SUPABASE_URL;
    if (import.meta.env.NEXT_PUBLIC_SUPABASE_URL) return import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
    if (import.meta.env.SUPABASE_URL) return import.meta.env.SUPABASE_URL;
  }
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) return process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  }
  return DEFAULT_SUPABASE_URL;
};

const getEnvKey = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env.VITE_SUPABASE_ANON_KEY) return import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (import.meta.env.SUPABASE_ANON_KEY) return import.meta.env.SUPABASE_ANON_KEY;
    if (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  }
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY;
    if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (process.env.SUPABASE_ANON_KEY) return process.env.SUPABASE_ANON_KEY;
    if (process.env.SUPABASE_PUBLISHABLE_KEY) return process.env.SUPABASE_PUBLISHABLE_KEY;
  }
  return DEFAULT_SUPABASE_ANON_KEY;
};

export const supabase = createClient(getEnvUrl(), getEnvKey());

