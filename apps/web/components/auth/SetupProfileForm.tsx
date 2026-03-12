'use client'

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Card, CardContent, CardFooter, Avatar } from '@mobtranslate/ui'
import { useAuth } from '@/contexts/AuthContext'
import { User, AtSign, Sparkles, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

interface SetupProfileFormProps {
  userEmail: string
}

export function SetupProfileForm({ userEmail }: SetupProfileFormProps) {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { refreshUser } = useAuth()

  const avatarInitials = useMemo(() => {
    if (displayName.trim()) {
      return displayName.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    }
    if (username.trim()) {
      return username.trim().slice(0, 2).toUpperCase()
    }
    return '?'
  }, [username, displayName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Create profile for the authenticated user
      const response = await fetch('/api/user/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          display_name: displayName.trim() || username.trim()
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create profile')
      }

      // Refresh user data in context
      await refreshUser()

      // Redirect to home page
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-[28rem] border-0 shadow-xl shadow-black/5 dark:shadow-black/20">
      <div className="px-6 pt-8 pb-2 sm:px-8">
        <div className="flex items-center gap-2 text-primary mb-3">
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-medium">Almost there!</span>
        </div>
        <h2 className="text-2xl font-display font-bold tracking-tight text-foreground">
          Set up your profile
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Choose how you&apos;ll appear in the community
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-5 px-6 sm:px-8 pt-4">
          {error && (
            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Avatar Preview */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border/50">
            <Avatar
              size="lg"
              fallback={avatarInitials}
              alt={displayName || username || 'User'}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {displayName.trim() || username.trim() || 'Your Name'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                @{username.trim() || 'username'}
              </p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {userEmail}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="username" className="block text-sm font-medium text-foreground">
              Username <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id="username"
                type="text"
                placeholder="Choose a unique username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
                pattern="^[a-zA-Z0-9_-]+$"
                minLength={3}
                maxLength={50}
                className="pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              3-50 characters. Letters, numbers, underscores, and hyphens only.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="displayName" className="block text-sm font-medium text-foreground">
              Display name
              <span className="text-muted-foreground font-normal ml-1">(optional)</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id="displayName"
                type="text"
                placeholder="How your name appears to others"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading}
                className="pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave blank to use your username
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 px-6 sm:px-8 pb-8 pt-2">
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating profile...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Complete setup
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}