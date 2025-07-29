-- Migration to consolidate profile tables and remove unused tables
-- This migration:
-- 1. Migrates data from profiles table to user_profiles
-- 2. Updates all references to use user_profiles
-- 3. Removes the unused profiles table
-- 4. Removes the unused contributors table (replaced by user_role_assignments)

-- First, migrate any missing data from profiles to user_profiles
INSERT INTO user_profiles (user_id, username, created_at, updated_at)
SELECT 
    p.id as user_id,
    p.username,
    p.created_at,
    p.updated_at
FROM profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM user_profiles up WHERE up.user_id = p.id
)
ON CONFLICT (user_id) DO NOTHING;

-- Update any references in other tables that might be using profiles.id
-- Since profiles.id is the same as auth.users.id, and user_profiles.user_id references auth.users.id,
-- no updates are needed for foreign key references

-- Drop the profiles table and its associated objects
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop the contributors table if it exists and is not being used
-- First check if there are any references to it
DO $$ 
BEGIN
    -- Check if language_contributors has any data
    IF NOT EXISTS (SELECT 1 FROM language_contributors LIMIT 1) THEN
        -- Drop the junction table first
        DROP TABLE IF EXISTS language_contributors CASCADE;
        -- Then drop the contributors table
        DROP TABLE IF EXISTS contributors CASCADE;
    END IF;
END $$;

-- Create or update the trigger for new user creation to use user_profiles
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger AS $$
BEGIN
  -- Create a user profile with the username from metadata
  INSERT INTO user_profiles (user_id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic profile creation
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Update RLS policies on user_profiles if needed
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Ensure proper RLS policies exist
DROP POLICY IF EXISTS "Users can view all profiles" ON user_profiles;
CREATE POLICY "Users can view all profiles" ON user_profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add comment to clarify the purpose
COMMENT ON TABLE user_profiles IS 'Primary user profile table - consolidates user information';

-- Update the count_auth_users function to handle errors better
CREATE OR REPLACE FUNCTION count_auth_users()
RETURNS INTEGER AS $$
DECLARE
    user_count INTEGER;
BEGIN
    -- Try to count from auth.users
    BEGIN
        SELECT COUNT(*) INTO user_count FROM auth.users;
        RETURN user_count;
    EXCEPTION WHEN OTHERS THEN
        -- If we can't access auth.users, count from user_profiles as fallback
        SELECT COUNT(*) INTO user_count FROM user_profiles;
        RETURN user_count;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up any unused views
DROP VIEW IF EXISTS words_needing_review CASCADE;
DROP VIEW IF EXISTS words_with_stats CASCADE;
DROP VIEW IF EXISTS curator_dashboard_stats CASCADE;