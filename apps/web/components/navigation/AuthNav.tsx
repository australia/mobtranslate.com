'use client'

import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/app/components/ui/button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export function AuthNav() {
  const { user, signOut, loading } = useAuth()
  const router = useRouter()

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push('/')
    } catch (error) {
      console.error('Failed to sign out:', error)
    }
  }

  if (loading) {
    return <div>Loading...</div>
  }

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm">Welcome, {user.email}</span>
        <Button onClick={handleSignOut} variant="outline" size="sm">
          Sign out
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <Link href="/auth/signin">
        <Button variant="outline" size="sm">
          Sign in
        </Button>
      </Link>
      <Link href="/auth/signup">
        <Button size="sm">
          Sign up
        </Button>
      </Link>
    </div>
  )
}