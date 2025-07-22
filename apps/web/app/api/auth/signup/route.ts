import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Username validation
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

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url)
    const formData = await request.json()
    const email = formData.email
    const password = formData.password
    const username = formData.username?.trim()
    const supabase = createClient()

    // Validate required fields
    if (!email || !password || !username) {
      return NextResponse.json(
        { error: 'Email, password, and username are required' },
        { status: 400 }
      )
    }

    // Validate username format
    const usernameError = validateUsername(username);
    if (usernameError) {
      return NextResponse.json(
        { error: usernameError },
        { status: 400 }
      )
    }

    // Check if username already exists (case-insensitive)
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('username')
      .ilike('username', username)
      .single()

    if (existingProfile) {
      return NextResponse.json(
        { error: 'Username already taken' },
        { status: 400 }
      )
    }

    // Sign up the user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${requestUrl.origin}/auth/callback`,
        data: {
          username: username,
        }
      },
    })

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    // Create profile for the user
    if (data.user) {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          user_id: data.user.id,
          username: username,
          display_name: username, // Default display name to username
        })

      if (profileError) {
        console.error('Failed to create user profile:', profileError)
        
        // If profile creation fails, we should clean up the auth user
        // However, this is complex with Supabase auth, so we'll log and continue
        return NextResponse.json(
          { error: 'Failed to complete user registration. Please try again.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      { 
        message: 'Check your email to confirm your account',
        user: data.user 
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}