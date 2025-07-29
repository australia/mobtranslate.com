-- Function to count total auth users
-- This requires elevated permissions to access auth.users table
CREATE OR REPLACE FUNCTION count_auth_users()
RETURNS INTEGER AS $$
DECLARE
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM auth.users;
    RETURN user_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION count_auth_users() TO authenticated;