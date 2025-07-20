import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// Username validation function (shared with signup)
function validateUsername(username: string): string | null {
  if (!username) {
    return 'Username is required';
  }
  
  if (username.length < 3) {
    return 'Username must be at least 3 characters long';
  }
  
  if (username.length > 50) {
    return 'Username must be no more than 50 characters long';
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return 'Username can only contain letters, numbers, underscores, and hyphens';
  }
  
  // Reserved usernames
  const reserved = ['admin', 'root', 'user', 'anonymous', 'guest', 'system', 'api', 'www', 'mail', 'ftp'];
  if (reserved.includes(username.toLowerCase())) {
    return 'This username is reserved';
  }
  
  return null;
}

// GET - Fetch user profile
export async function GET(request: NextRequest) {
  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      // If no profile exists, create a default one
      if (profileError.code === 'PGRST116') {
        console.log('No profile found, creating default profile for user:', user.id);
        
        // Generate a default username from email
        const emailPrefix = user.email?.split('@')[0] || 'user';
        const randomSuffix = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
        let defaultUsername = `${emailPrefix}${randomSuffix}`.replace(/[^a-zA-Z0-9_-]/g, '');
        
        // Ensure username is valid length
        if (defaultUsername.length < 3) {
          defaultUsername = `user${randomSuffix}`;
        } else if (defaultUsername.length > 50) {
          defaultUsername = defaultUsername.substring(0, 50);
        }
        
        // Try to create profile with generated username
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: user.id,
            username: defaultUsername,
            display_name: emailPrefix
          })
          .select()
          .single();
        
        if (createError) {
          console.error('Error creating default profile:', createError);
          // If username is taken, try with a different suffix
          const timestamp = Date.now().toString().slice(-6);
          const fallbackUsername = `user${timestamp}`;
          
          const { data: fallbackProfile, error: fallbackError } = await supabase
            .from('user_profiles')
            .insert({
              user_id: user.id,
              username: fallbackUsername,
              display_name: emailPrefix
            })
            .select()
            .single();
          
          if (fallbackError) {
            console.error('Error creating fallback profile:', fallbackError);
            return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 });
          }
          
          return NextResponse.json({ profile: fallbackProfile });
        }
        
        return NextResponse.json({ profile: newProfile });
      }
      
      console.error('Error fetching profile:', profileError);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update user profile
export async function PUT(request: NextRequest) {
  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { username, display_name, bio } = body;

    // Validate username if provided
    if (username !== undefined) {
      const usernameError = validateUsername(username);
      if (usernameError) {
        return NextResponse.json({ error: usernameError }, { status: 400 });
      }

      // Check if username is already taken by another user
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('user_id, username')
        .ilike('username', username)
        .neq('user_id', user.id)
        .single();

      if (existingProfile) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 400 });
      }
    }

    // Validate display_name
    if (display_name !== undefined && display_name.length > 100) {
      return NextResponse.json({ error: 'Display name must be no more than 100 characters' }, { status: 400 });
    }

    // Validate bio
    if (bio !== undefined && bio.length > 500) {
      return NextResponse.json({ error: 'Bio must be no more than 500 characters' }, { status: 400 });
    }

    // Update profile
    const updateData: any = {};
    if (username !== undefined) updateData.username = username;
    if (display_name !== undefined) updateData.display_name = display_name;
    if (bio !== undefined) updateData.bio = bio;

    const { data: updatedProfile, error: updateError } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ 
      profile: updatedProfile,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}