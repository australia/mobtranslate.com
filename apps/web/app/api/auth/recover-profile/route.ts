import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, password, username } = await request.json()
    const supabase = createClient()

    console.log('[RECOVER] Starting profile recovery for:', { email, username });

    // First, try to sign in to verify credentials
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      console.error('[RECOVER] Sign in failed:', signInError);
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    if (!signInData.user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    console.log('[RECOVER] User authenticated successfully:', {
      userId: signInData.user.id,
      email: signInData.user.email
    });

    // Check if profile already exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', signInData.user.id)
      .single();

    console.log('[RECOVER] Profile check:', {
      hasProfile: !!existingProfile,
      error: checkError?.message
    });

    if (existingProfile) {
      console.log('[RECOVER] Profile already exists:', existingProfile);
      return NextResponse.json({
        message: 'Profile already exists',
        profile: existingProfile
      });
    }

    // Check if username is available
    const { data: usernameCheck } = await supabase
      .from('user_profiles')
      .select('username')
      .ilike('username', username)
      .single();

    if (usernameCheck) {
      console.log('[RECOVER] Username already taken:', username);
      return NextResponse.json(
        { error: 'Username already taken' },
        { status: 400 }
      )
    }

    // Create the missing profile
    console.log('[RECOVER] Creating missing profile:', {
      user_id: signInData.user.id,
      username,
      email: signInData.user.email
    });

    const { data: newProfile, error: createError } = await supabase
      .from('user_profiles')
      .insert({
        user_id: signInData.user.id,
        username: username,
        display_name: username,
        email: signInData.user.email
      })
      .select()
      .single();

    if (createError) {
      console.error('[RECOVER] Failed to create profile:', {
        error: createError.message,
        code: createError.code,
        details: createError.details
      });
      
      return NextResponse.json(
        { error: 'Failed to create profile', details: createError.message },
        { status: 500 }
      )
    }

    console.log('[RECOVER] Profile created successfully:', newProfile);

    return NextResponse.json({
      message: 'Profile created successfully',
      profile: newProfile,
      user: signInData.user
    });

  } catch (error) {
    console.error('[RECOVER] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}