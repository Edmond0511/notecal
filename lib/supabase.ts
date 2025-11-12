import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Types for our database tables
export interface Profile {
  id: string;
  email: string;
  created_at: string;
  usage_quota: number;
  current_usage: number;
}

export interface NutritionCache {
  id: number;
  food_query: string;
  nutrition_data: {
    items: Array<{
      label: string;
      qty: number;
      unit: string;
      confidence: number;
      macros: {
        kcal: number;
        protein: number;
        fat: number;
        carbs: number;
      };
    }>;
    totals: {
      kcal: number;
      protein: number;
      fat: number;
      carbs: number;
    };
  };
  confidence_score: number;
  created_at: string;
  expires_at: string;
}

export interface ApiUsage {
  id: number;
  user_id: string;
  ai_provider: 'openai' | 'gemini' | 'claude';
  tokens_used: number;
  cost_cents: number;
  created_at: string;
}

// Edge Function types
export interface NutritionResolveRequest {
  foodText: string;
  userId?: string;
  aiProvider?: 'openai' | 'gemini' | 'claude';
}

export interface NutritionResolveResponse {
  data: {
    items: Array<{
      label: string;
      qty: number;
      unit: string;
      confidence: number;
      macros: {
        kcal: number;
        protein: number;
        fat: number;
        carbs: number;
      };
    }>;
    totals: {
      kcal: number;
      protein: number;
      fat: number;
      carbs: number;
    };
    tokens?: number;
  };
}