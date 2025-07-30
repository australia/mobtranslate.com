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
  console.log('[SIGNUP] Starting signup process', {
    timestamp: new Date().toISOString(),
    url: request.url,
    headers: Object.fromEntries(request.headers.entries())
  });

  try {
    const requestUrl = new URL(request.url)
    const formData = await request.json()
    const email = formData.email
    const password = formData.password
    const username = formData.username?.trim()
    const supabase = createClient()

    console.log('[SIGNUP] Parsed form data', {
      email,
      username,
      hasPassword: !!password,
      passwordLength: password?.length
    })

    // Log Supabase configuration
    console.log('[SIGNUP] Supabase configuration:', {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      anonKeyLength: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length
    })

    // Test database connection
    try {
      const { count, error: countError } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
      
      console.log('[SIGNUP] Database connection test:', {
        success: !countError,
        profileCount: count,
        error: countError?.message
      })
    } catch (dbTestError) {
      console.error('[SIGNUP] Database connection test failed:', dbTestError)
    }

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
    console.log('[SIGNUP] Checking if username exists:', username);
    const { data: existingProfile, error: checkError } = await supabase
      .from('user_profiles')
      .select('username, email, user_id')
      .ilike('username', username)
      .single()

    console.log('[SIGNUP] Username check result', {
      username,
      exists: !!existingProfile,
      checkError: checkError?.message,
      checkErrorCode: checkError?.code,
      checkErrorDetails: checkError?.details
    });

    if (existingProfile) {
      return NextResponse.json(
        { error: 'Username already taken' },
        { status: 400 }
      )
    }

    // Let Supabase Auth handle email uniqueness - it will return an appropriate error

    // Sign up the user
    console.log('[SIGNUP] Creating auth user', {
      email,
      username,
      timestamp: new Date().toISOString()
    });
    
    console.log('[SIGNUP] Auth signup options being sent:', {
      email,
      passwordLength: password.length,
      emailRedirectTo: `${requestUrl.origin}/auth/callback`,
      metadata: {
        username: username
      }
    });

    // Log Supabase client state
    const { data: { session } } = await supabase.auth.getSession();
    console.log('[SIGNUP] Current session state before signup:', {
      hasSession: !!session,
      sessionUser: session?.user?.email
    });

    let signupResponse;
    try {
      signupResponse = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${requestUrl.origin}/auth/callback`,
          data: {
            username: username,
          }
        },
      });
      
      console.log('[SIGNUP] Raw auth.signUp response:', {
        hasData: !!signupResponse.data,
        hasError: !!signupResponse.error,
        dataKeys: signupResponse.data ? Object.keys(signupResponse.data) : [],
        errorKeys: signupResponse.error ? Object.keys(signupResponse.error) : [],
        userData: signupResponse.data?.user ? {
          id: signupResponse.data.user.id,
          email: signupResponse.data.user.email,
          created_at: signupResponse.data.user.created_at
        } : null
      });
    } catch (signupException) {
      console.error('[SIGNUP] Exception during auth.signUp:', {
        message: signupException instanceof Error ? signupException.message : String(signupException),
        stack: signupException instanceof Error ? signupException.stack : undefined,
        type: signupException?.constructor?.name
      });
      throw signupException;
    }

    const { data, error } = signupResponse;

    if (error) {
      console.error('[SIGNUP] Auth signup failed', {
        error: error.message,
        errorCode: error.code,
        errorStatus: error.status,
        errorName: error.name,
        fullError: JSON.stringify(error, null, 2),
        email,
        username
      });
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    // Profile creation is handled automatically by database trigger
    if (data.user) {
      console.log('[SIGNUP] Auth user created successfully', {
        userId: data.user.id,
        email: data.user.email,
        username,
        timestamp: new Date().toISOString()
      });

      console.log('[SIGNUP] Profile will be created automatically by database trigger');
    }

    return NextResponse.json(
      { 
        message: 'Check your email to confirm your account',
        user: data.user 
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[SIGNUP] Unexpected error during signup:', {
      error: error instanceof Error ? error.message : String(error),
      errorType: error?.constructor?.name,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      fullError: JSON.stringify(error, null, 2)
    });
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}