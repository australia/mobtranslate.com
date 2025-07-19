import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const requestUrl = new URL(request.url)
  const formData = await request.json()
  const email = formData.email
  const password = formData.password
  const username = formData.username
  const supabase = createClient()

  // Check if username already exists
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
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
      .from('profiles')
      .insert({
        id: data.user.id,
        username: username,
      })

    if (profileError) {
      // If profile creation fails, we should handle this gracefully
      console.error('Failed to create profile:', profileError)
    }
  }

  return NextResponse.json(
    { 
      message: 'Check your email to confirm your account',
      user: data.user 
    },
    { status: 200 }
  )
}