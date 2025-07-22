import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    )
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  if (profileError) {
    return NextResponse.json(
      { error: 'Profile not found' },
      { status: 404 }
    )
  }

  return NextResponse.json(
    { 
      user: {
        ...user,
        username: profile.username
      }
    },
    { status: 200 }
  )
}