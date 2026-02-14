'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Alert, AlertDescription, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@mobtranslate/ui'
import { useAuth } from '@/contexts/AuthContext'

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

      // Show success message
      alert('Profile created successfully!')
      
      // Redirect to home page
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-[28rem]">
      <CardHeader>
        <CardTitle>Complete Your Profile</CardTitle>
        <CardDescription>
          Welcome! Please set up your username to continue.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <Input
              id="email"
              type="email"
              value={userEmail}
              disabled
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">Username</label>
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
            />
            <p className="text-xs text-muted-foreground">
              3-50 characters, letters, numbers, underscores, and hyphens only
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="displayName" className="text-sm font-medium">Display Name (optional)</label>
            <Input
              id="displayName"
              type="text"
              placeholder="How your name appears to others"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use your username
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating Profile...' : 'Complete Setup'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}