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
  console.log('[PROFILE GET] Starting profile fetch', {
    timestamp: new Date().toISOString(),
    headers: Object.fromEntries(request.headers.entries())
  });

  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  console.log('[PROFILE GET] Auth check result', {
    hasUser: !!user,
    userId: user?.id,
    userEmail: user?.email,
    authError: authError?.message,
    authErrorCode: authError?.code
  });

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Get user profile
    console.log('[PROFILE GET] Fetching profile for user:', user.id);
    
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    console.log('[PROFILE GET] Profile fetch result', {
      hasProfile: !!profile,
      profileData: profile,
      error: profileError?.message,
      errorCode: profileError?.code,
      errorDetails: profileError?.details,
      errorHint: profileError?.hint
    });

    if (profileError) {
      // If no profile exists, create a default one
      if (profileError.code === 'PGRST116') {
        console.log('[PROFILE GET] No profile found (PGRST116), creating default profile', {
          userId: user.id,
          userEmail: user.email,
          timestamp: new Date().toISOString()
        });
        
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
        console.log('[PROFILE GET] Attempting to create profile', {
          user_id: user.id,
          username: defaultUsername,
          display_name: emailPrefix
        });

        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            user_id: user.id,
            username: defaultUsername,
            display_name: emailPrefix
          })
          .select()
          .single();
        
        console.log('[PROFILE GET] Profile creation attempt result', {
          success: !createError,
          newProfile,
          error: createError?.message,
          errorCode: createError?.code,
          errorDetails: createError?.details,
          errorHint: createError?.hint,
          fullError: createError ? JSON.stringify(createError, null, 2) : null
        });

        if (createError) {
          console.error('[PROFILE GET] Error creating default profile - DETAILED:', {
            errorMessage: createError.message,
            errorCode: createError.code,
            errorDetails: createError.details,
            errorHint: createError.hint,
            userId: user.id,
            attemptedUsername: defaultUsername,
            timestamp: new Date().toISOString(),
            fullError: JSON.stringify(createError, null, 2)
          });
          // If username is taken, try with a different suffix
          const timestamp = Date.now().toString().slice(-6);
          const fallbackUsername = `user${timestamp}`;
          
          console.log('[PROFILE GET] Attempting fallback profile creation', {
            user_id: user.id,
            username: fallbackUsername,
            display_name: emailPrefix
          });

          const { data: fallbackProfile, error: fallbackError } = await supabase
            .from('user_profiles')
            .insert({
              user_id: user.id,
              username: fallbackUsername,
              display_name: emailPrefix
            })
            .select()
            .single();
          
          console.log('[PROFILE GET] Fallback creation result', {
            success: !fallbackError,
            fallbackProfile,
            error: fallbackError?.message,
            errorCode: fallbackError?.code,
            errorDetails: fallbackError?.details,
            fullError: fallbackError ? JSON.stringify(fallbackError, null, 2) : null
          });

          if (fallbackError) {
            console.error('[PROFILE GET] Error creating fallback profile - DETAILED:', {
              errorMessage: fallbackError.message,
              errorCode: fallbackError.code,
              errorDetails: fallbackError.details,
              errorHint: fallbackError.hint,
              userId: user.id,
              attemptedUsername: fallbackUsername,
              timestamp: new Date().toISOString(),
              fullError: JSON.stringify(fallbackError, null, 2),
              stackTrace: new Error().stack
            });
            return NextResponse.json({ 
              error: 'Failed to create user profile',
              details: {
                code: fallbackError.code,
                message: fallbackError.message,
                hint: fallbackError.hint
              }
            }, { status: 500 });
          }
          
          return NextResponse.json({ profile: fallbackProfile });
        }
        
        return NextResponse.json({ profile: newProfile });
      }
      
      console.error('[PROFILE GET] Error fetching profile - DETAILED:', {
        errorMessage: profileError.message,
        errorCode: profileError.code,
        errorDetails: profileError.details,
        errorHint: profileError.hint,
        userId: user.id,
        timestamp: new Date().toISOString(),
        fullError: JSON.stringify(profileError, null, 2)
      });
      return NextResponse.json({ 
        error: 'Failed to fetch profile',
        details: {
          code: profileError.code,
          message: profileError.message
        }
      }, { status: 500 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('[PROFILE GET] Unexpected error:', {
      error: error instanceof Error ? error.message : String(error),
      errorType: error?.constructor?.name,
      stack: error instanceof Error ? error.stack : undefined,
      userId: user?.id,
      timestamp: new Date().toISOString(),
      fullError: JSON.stringify(error, null, 2)
    });
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST - Create user profile
export async function POST(request: NextRequest) {
  const supabase = createClient();

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { username, display_name } = body;

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('user_id', user.id)
      .single();

    if (existingProfile) {
      return NextResponse.json({ error: 'Profile already exists' }, { status: 400 });
    }

    // Validate username
    const usernameError = validateUsername(username);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }

    // Check if username is already taken
    const { data: usernameCheck } = await supabase
      .from('user_profiles')
      .select('username')
      .ilike('username', username)
      .single();

    if (usernameCheck) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 400 });
    }

    // Create profile
    const { data: newProfile, error: createError } = await supabase
      .from('user_profiles')
      .insert({
        user_id: user.id,
        username: username,
        display_name: display_name || username,
        email: user.email
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating profile:', createError);
      return NextResponse.json({ 
        error: 'Failed to create profile',
        details: createError.message
      }, { status: 500 });
    }

    return NextResponse.json({ 
      profile: newProfile,
      message: 'Profile created successfully'
    });
  } catch (error) {
    console.error('Profile creation error:', error);
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