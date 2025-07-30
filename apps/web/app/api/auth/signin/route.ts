import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const formData = await request.json()
  const email = formData.email
  const password = formData.password
  const supabase = createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  // Check if user has a profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('username, display_name')
    .eq('user_id', data.user.id)
    .single()

  const needsProfile = !profile || profileError?.code === 'PGRST116'

  return NextResponse.json(
    { 
      message: 'Successfully signed in',
      user: data.user,
      needsProfile,
      profile: profile || null
    },
    { status: 200 }
  )
}