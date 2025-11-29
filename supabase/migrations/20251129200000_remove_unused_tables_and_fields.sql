-- Migration: Remove unused tables and fields from NoteCal database
-- This migration cleans up the database by removing unused schema elements
-- Step 1: Drop unused tables that have no foreign key dependencies
-- Drop food_history table (never implemented, no code references)
DROP TABLE IF EXISTS public.food_history CASCADE;

-- Drop ai_prompts table (hardcoded prompts used instead)
DROP TABLE IF EXISTS public.ai_prompts CASCADE;

-- Step 2: Remove unused fields from profiles table
-- Note: email and id are kept as they're used by auth system and for FK relationships
-- Remove avatar_url (auth system handles this)
DO $ $ BEGIN IF EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_name = 'profiles'
        AND column_name = 'avatar_url'
) THEN
ALTER TABLE
    public.profiles DROP COLUMN avatar_url;

RAISE NOTICE 'Dropped avatar_url from profiles table';

END IF;

END $ $;

-- Remove full_name (auth system handles this)
DO $ $ BEGIN IF EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_name = 'profiles'
        AND column_name = 'full_name'
) THEN
ALTER TABLE
    public.profiles DROP COLUMN full_name;

RAISE NOTICE 'Dropped full_name from profiles table';

END IF;

END $ $;

-- Remove dietary_restrictions (never referenced in code)
DO $ $ BEGIN IF EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_name = 'profiles'
        AND column_name = 'dietary_restrictions'
) THEN
ALTER TABLE
    public.profiles DROP COLUMN dietary_restrictions;

RAISE NOTICE 'Dropped dietary_restrictions from profiles table';

END IF;

END $ $;


-- Note: subscription_tier is kept for potential future subscription features
-- Step 3: Clean up any related indexes that might exist
DROP INDEX IF EXISTS public.idx_food_history_user_id_created_at;

DROP INDEX IF EXISTS public.idx_ai_prompts_prompt_type;

-- Step 4: RLS policies automatically removed with CASCADE drops above
DO $ $ BEGIN RAISE NOTICE 'Migration completed: Successfully removed unused tables and fields';

END $ $;