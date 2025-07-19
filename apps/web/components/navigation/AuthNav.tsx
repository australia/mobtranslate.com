'use client'

import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/app/components/ui/button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart, BarChart3, Brain } from 'lucide-react'

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
      <div className="flex items-center gap-2">
        <Link href="/learn">
          <Button variant="ghost" size="sm" className="gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Learn</span>
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
        </Link>
        <Link href="/my-likes">
          <Button variant="ghost" size="sm" className="gap-2">
            <Heart className="h-4 w-4" />
            <span className="hidden sm:inline">My Likes</span>
          </Button>
        </Link>
        <span className="text-sm hidden md:inline">Welcome, {user.email}</span>
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