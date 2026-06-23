import { SetupProfileForm } from '@/components/auth/SetupProfileForm'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getSessionUser } from '@/lib/auth-helpers'
import { db } from '@/lib/db/index'
import { userProfiles } from '@/lib/db/schema'

export default async function SetupProfilePage() {
  const user = await getSessionUser()

  if (!user) {
    redirect('/auth/signin')
  }

  // Profiles are auto-created on signup, but keep the guard for safety.
  const profile = await db
    .select({ username: userProfiles.username })
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id))
    .limit(1)

  if (profile.length > 0) {
    redirect('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <SetupProfileForm userEmail={user.email || ''} />
    </div>
  )
}
