-- Migration: Remove all ai_provider references for Gemini-only architecture
-- This migration cleans up the database schema to remove multi-provider complexity

-- Step 1: Drop the popular_foods view first since it depends on ai_provider column
DROP VIEW IF EXISTS public.popular_foods;

-- Step 2: Remove ai_provider column from profiles table if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'preferred_ai_provider'
    ) THEN
        ALTER TABLE public.profiles DROP COLUMN preferred_ai_provider;
        RAISE NOTICE 'Dropped preferred_ai_provider from profiles table';
    END IF;
END $$;

-- Step 3: Remove ai_provider column from nutrition_cache table if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'nutrition_cache' AND column_name = 'ai_provider'
    ) THEN
        ALTER TABLE public.nutrition_cache DROP COLUMN ai_provider;
        RAISE NOTICE 'Dropped ai_provider from nutrition_cache table';
    END IF;
END $$;

-- Step 4: Remove ai_provider column from api_usage table if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_usage' AND column_name = 'ai_provider'
    ) THEN
        ALTER TABLE public.api_usage DROP COLUMN ai_provider;
        RAISE NOTICE 'Dropped ai_provider from api_usage table';
    END IF;
END $$;

-- Step 5: Remove provider column from ai_prompts table if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_prompts' AND column_name = 'provider'
    ) THEN
        ALTER TABLE public.ai_prompts DROP COLUMN provider;
        RAISE NOTICE 'Dropped provider from ai_prompts table';
    END IF;
END $$;

-- Step 6: Update the existing ai_prompts record if it still has gemini as provider
UPDATE public.ai_prompts
SET template = 'You are a certified nutritionist. Extract food items and provide accurate macronutrients.
Rules: Convert to grams, use standard portions, calculate realistic USDA-based values.
Include all macros: kcal, protein, fat, carbs. Set confidence 0.9-1.0 for common foods.
Return ONLY valid JSON: {"items": [{"label": "food", "qty": 100, "unit": "g", "confidence": 0.9, "macros": {"kcal": 150, "protein": 20, "fat": 5, "carbs": 15}}], "totals": {"kcal": 150, "protein": 20, "fat": 5, "carbs": 15}}'
WHERE prompt_type = 'food_extraction';

-- Step 7: Recreate the popular_foods view without ai_provider
CREATE OR REPLACE VIEW public.popular_foods AS
SELECT
  food_query,
  nutrition_data,
  confidence_score,
  hit_count
FROM
  public.nutrition_cache
WHERE
  hit_count > 0
ORDER BY
  hit_count DESC,
  confidence_score DESC;

DO $$ BEGIN RAISE NOTICE 'Migration completed: Successfully removed all ai_provider references'; END $$;