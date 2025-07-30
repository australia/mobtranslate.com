-- Fix the user profile trigger to bypass RLS when creating profiles
-- The trigger needs to run with elevated privileges to insert profiles

-- First, update the trigger function to use security definer and set search_path
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log the trigger execution
  RAISE LOG 'handle_new_user_profile: Starting for user_id=%, email=%', NEW.id, NEW.email;
  
  -- Create a user profile with the username from metadata
  INSERT INTO user_profiles (user_id, username, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  
  RAISE LOG 'handle_new_user_profile: Successfully created/updated profile for user_id=%', NEW.id;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't fail the user creation
  RAISE LOG 'handle_new_user_profile ERROR: % - SQLSTATE: % - for user_id=%, email=%', 
    SQLERRM, SQLSTATE, NEW.id, NEW.email;
  -- Return NEW to allow the auth user creation to continue
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions to the function
GRANT USAGE ON SCHEMA public TO postgres, authenticated, anon;
GRANT ALL ON user_profiles TO postgres;
GRANT SELECT ON user_profiles TO anon, authenticated;

-- Alternative approach: Create a system-level insert policy
-- This allows inserts when the session user is null (during trigger execution)
DROP POLICY IF EXISTS "System can create profiles" ON user_profiles;
CREATE POLICY "System can create profiles" ON user_profiles
  FOR INSERT 
  WITH CHECK (
    -- Allow system/trigger inserts when there's no authenticated user
    auth.uid() IS NULL 
    OR 
    -- Allow users to create their own profile
    auth.uid() = user_id
  );

-- Update the existing insert policy to be more permissive
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT 
  WITH CHECK (
    -- Allow when user is creating their own profile
    auth.uid() = user_id
    OR
    -- Allow when it's a system operation (no auth context)
    auth.uid() IS NULL
  );

-- Add a comment explaining the fix
COMMENT ON FUNCTION public.handle_new_user_profile() IS 
'Creates user profile after auth user creation. Uses SECURITY DEFINER to bypass RLS.';