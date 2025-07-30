import { SetupProfileForm } from '@/components/auth/SetupProfileForm'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function SetupProfilePage() {
  const supabase = createClient()
  
  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/signin')
  }
  
  // Check if user already has a profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('username')
    .eq('user_id', user.id)
    .single()
  
  if (profile) {
    // User already has a profile, redirect to home
    redirect('/')
  }
  
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <SetupProfileForm userEmail={user.email || ''} />
    </div>
  )
}