-- Add email column to user_profiles table and create function to get auth emails
-- This allows us to access user emails without needing admin privileges

-- Add email column to user_profiles if it doesn't exist
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index on email for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Update existing user_profiles with emails from auth.users
UPDATE user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.user_id = au.id
AND up.email IS NULL;

-- Create function to get auth user emails (for admins only)
CREATE OR REPLACE FUNCTION get_auth_user_emails()
RETURNS TABLE (
    id UUID,
    email TEXT,
    last_sign_in_at TIMESTAMPTZ,
    email_confirmed_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Check if the calling user is an admin
    IF NOT EXISTS (
        SELECT 1 
        FROM user_role_assignments ura
        JOIN user_roles ur ON ura.role_id = ur.id
        WHERE ura.user_id = auth.uid()
        AND ura.is_active = true
        AND ur.name IN ('super_admin', 'dictionary_admin')
    ) THEN
        RAISE EXCEPTION 'Access denied. Admin role required.';
    END IF;

    -- Return auth user data
    RETURN QUERY
    SELECT 
        au.id,
        au.email::TEXT,
        au.last_sign_in_at,
        au.email_confirmed_at
    FROM auth.users au;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_auth_user_emails() TO authenticated;

-- Update the handle_new_user_profile function to include email
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger AS $$
BEGIN
  -- Create a user profile with the username and email from auth
  INSERT INTO user_profiles (user_id, username, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    email = EXCLUDED.email,
    updated_at = NOW()
  WHERE user_profiles.email IS NULL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;