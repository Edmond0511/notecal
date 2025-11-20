-- ============================================
-- NoteCal Nutrition Tracking Database Schema
-- ============================================
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table - extends auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  usage_quota INTEGER DEFAULT 1000,
  -- monthly API calls quota
  current_usage INTEGER DEFAULT 0,
  -- current month usage
  subscription_tier TEXT DEFAULT 'free',
  -- free, premium, etc.
  -- User preferences
  preferred_ai_provider TEXT DEFAULT 'gemini',
  -- gemini only
  dietary_restrictions TEXT [],
  -- e.g., ['vegetarian', 'gluten-free']
  preferred_units TEXT DEFAULT 'metric',
  -- metric, imperial
  CONSTRAINT check_usage_quota CHECK (usage_quota >= 0),
  CONSTRAINT check_current_usage CHECK (current_usage >= 0)
);

-- Nutrition cache for performance optimization
CREATE TABLE IF NOT EXISTS public.nutrition_cache (
  id SERIAL PRIMARY KEY,
  food_query TEXT UNIQUE NOT NULL,
  normalized_query TEXT,
  -- standardized version of the query
  nutrition_data JSONB NOT NULL,
  confidence_score FLOAT DEFAULT 0.0 CHECK (
    confidence_score >= 0
    AND confidence_score <= 1
  ),
  ai_provider TEXT,
  -- which AI provider generated this
  hit_count INTEGER DEFAULT 0,
  -- how many times this cache entry was used
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  CONSTRAINT check_confidence_score CHECK (
    confidence_score >= 0
    AND confidence_score <= 1
  ),
  CONSTRAINT check_hit_count CHECK (hit_count >= 0)
);

-- API usage tracking for cost management
CREATE TABLE IF NOT EXISTS public.api_usage (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ai_provider TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0 CHECK (tokens_used >= 0),
  cost_cents INTEGER DEFAULT 0 CHECK (cost_cents >= 0),
  request_type TEXT DEFAULT 'nutrition',
  -- nutrition, chat, etc.
  status TEXT DEFAULT 'success',
  -- success, error, timeout
  error_message TEXT,
  response_time_ms INTEGER,
  -- response time in milliseconds
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User favorite foods for quick access
CREATE TABLE IF NOT EXISTS public.favorite_foods (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  food_label TEXT NOT NULL,
  standard_portion_qty INTEGER DEFAULT 100,
  standard_portion_unit TEXT DEFAULT 'g',
  frequency_score INTEGER DEFAULT 1,
  -- how often user uses this (1-10)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, food_label)
);

-- User food history for personalized suggestions
CREATE TABLE IF NOT EXISTS public.food_history (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  food_label TEXT NOT NULL,
  portion_qty INTEGER,
  portion_unit TEXT,
  meal_type TEXT,
  -- breakfast, lunch, dinner, snack
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT check_portion_qty CHECK (portion_qty >= 0)
);

-- AI prompts and templates for different providers
CREATE TABLE IF NOT EXISTS public.ai_prompts (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  -- gemini only
  prompt_type TEXT NOT NULL,
  -- food_extraction, nutrition_estimation, etc.
  template TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quality feedback and performance tracking
CREATE TABLE IF NOT EXISTS public.nutrition_feedback (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  food_query TEXT NOT NULL,
  nutrition_data JSONB NOT NULL,
  user_rating INTEGER CHECK (
    user_rating >= 1
    AND user_rating <= 5
  ),
  accuracy_feedback TEXT,
  portion_correct BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default AI prompts
INSERT INTO
  public.ai_prompts (provider, prompt_type, template)
VALUES
  (
    'gemini',
    'food_extraction',
    'You are a certified nutritionist. Extract food items and provide accurate macronutrients.
Rules: Convert to grams, use standard portions, calculate realistic USDA-based values.
Include all macros: kcal, protein, fat, carbs. Set confidence 0.9-1.0 for common foods.
Return ONLY valid JSON: {"items": [{"label": "food", "qty": 100, "unit": "g", "confidence": 0.9, "macros": {"kcal": 150, "protein": 20, "fat": 5, "carbs": 15}}], "totals": {"kcal": 150, "protein": 20, "fat": 5, "carbs": 15}}'
  );

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_nutrition_cache_food_query ON public.nutrition_cache(food_query);

CREATE INDEX IF NOT EXISTS idx_nutrition_cache_expires_at ON public.nutrition_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_id_created_at ON public.api_usage(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_favorite_foods_user_id ON public.favorite_foods(user_id);

CREATE INDEX IF NOT EXISTS idx_food_history_user_id_created_at ON public.food_history(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_nutrition_feedback_user_id_created_at ON public.nutrition_feedback(user_id, created_at);

-- Row Level Security (RLS) policies
ALTER TABLE
  public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE
  public.api_usage ENABLE ROW LEVEL SECURITY;

ALTER TABLE
  public.favorite_foods ENABLE ROW LEVEL SECURITY;

ALTER TABLE
  public.food_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE
  public.nutrition_feedback ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own profile" ON public.profiles FOR
SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles FOR
UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles FOR
INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own API usage" ON public.api_usage FOR
SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API usage" ON public.api_usage FOR
INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own favorite foods" ON public.favorite_foods FOR
SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own favorite foods" ON public.favorite_foods FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own food history" ON public.food_history FOR
SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own food history" ON public.food_history FOR
INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own nutrition feedback" ON public.nutrition_feedback FOR
SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own nutrition feedback" ON public.nutrition_feedback FOR
INSERT
  WITH CHECK (auth.uid() = user_id);

-- Functions for automatic timestamp updates
CREATE
OR REPLACE FUNCTION public.handle_updated_at() RETURNS TRIGGER AS $ $ BEGIN NEW.updated_at = NOW();

RETURN NEW;

END;

$ $ LANGUAGE plpgsql;

-- Triggers for automatic updated_at
CREATE TRIGGER handle_profiles_updated_at BEFORE
UPDATE
  ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_nutrition_cache_updated_at BEFORE
UPDATE
  ON public.nutrition_cache FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_ai_prompts_updated_at BEFORE
UPDATE
  ON public.ai_prompts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to handle new user signup
CREATE
OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $ $ BEGIN
INSERT INTO
  public.profiles (id, email)
VALUES
  (NEW.id, NEW.email);

RETURN NEW;

END;

$ $ LANGUAGE plpgsql;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
AFTER
INSERT
  ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to clean expired cache entries
CREATE
OR REPLACE FUNCTION public.clean_expired_cache() RETURNS INTEGER AS $ $ DECLARE deleted_count INTEGER;

BEGIN
DELETE FROM
  public.nutrition_cache
WHERE
  expires_at < NOW();

GET DIAGNOSTICS deleted_count = ROW_COUNT;

RETURN deleted_count;

END;

$ $ LANGUAGE plpgsql;

-- Views for common queries
CREATE
OR REPLACE VIEW public.user_usage_summary AS
SELECT
  p.id as user_id,
  p.email,
  p.usage_quota,
  p.current_usage,
  COUNT(au.id) as total_requests,
  SUM(au.tokens_used) as total_tokens,
  SUM(au.cost_cents) as total_cost_cents,
  MAX(au.created_at) as last_request
FROM
  public.profiles p
  LEFT JOIN public.api_usage au ON p.id = au.user_id
WHERE
  au.created_at >= date_trunc('month', CURRENT_DATE)
GROUP BY
  p.id,
  p.email,
  p.usage_quota,
  p.current_usage;

-- Cache optimization view
CREATE
OR REPLACE VIEW public.popular_foods AS
SELECT
  food_query,
  nutrition_data,
  confidence_score,
  hit_count,
  ai_provider
FROM
  public.nutrition_cache
WHERE
  hit_count > 0
ORDER BY
  hit_count DESC,
  confidence_score DESC;