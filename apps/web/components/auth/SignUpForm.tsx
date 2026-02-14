'use client'

import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button, Input, Alert, AlertDescription, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@mobtranslate/ui'
import Link from 'next/link'

export function SignUpForm() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (!username.trim()) {
      setError('Username is required')
      return
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      setError('Username can only contain letters, numbers, underscores, and hyphens')
      return
    }

    if (username.length > 50) {
      setError('Username must be no more than 50 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      await signUp(email, password, username)
      setSuccess(true)
      setUsername('')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create account'
      setError(errorMessage)
      
      // Check if the error indicates the user exists without a profile
      if (errorMessage.includes('already exists but is missing a profile')) {
        // Add a link to sign in
        setError(errorMessage + ' Click below to sign in.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Enter your email below to create your account</CardDescription>
      </CardHeader>
      {success ? (
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription className="text-success">
              Account created successfully! Please check your email to confirm your account before signing in.
            </AlertDescription>
          </Alert>
          <div className="text-center">
            <Link href="/auth/signin" className="text-primary hover:underline text-sm">
              Go to sign in
            </Link>
          </div>
        </CardContent>
      ) : (
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">Username</label>
            <Input
              id="username"
              type="text"
              placeholder="johndoe"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Sign up'}
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  )
}