'use client'

import React, { createContext, useContext } from 'react'
import { authClient } from '@/lib/auth-client'

// Public API kept identical to the old Supabase-backed context so the ~18
// consumers (pages + components/auth/*) don't change. Internally backed by
// better-auth (lib/auth-client.ts).
interface AuthContextType {
  user: any | null
  loading: boolean
  signIn: (_email: string, _password: string) => Promise<{ needsProfile?: boolean; user?: any; [key: string]: any }>
  signUp: (_email: string, _password: string, _username: string) => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending, refetch } = authClient.useSession()
  const user = session?.user ?? null

  const refreshUser = async () => {
    await refetch?.()
  }

  const signIn = async (email: string, password: string) => {
    const { data, error } = await authClient.signIn.email({ email, password })
    if (error) {
      throw new Error(error.message || 'Failed to sign in')
    }
    await refetch?.()
    // Profiles are auto-created on signup, so a profile always exists.
    return { needsProfile: false, user: data?.user }
  }

  const signUp = async (email: string, password: string, username: string) => {
    const { error } = await authClient.signUp.email({ email, password, name: username })
    if (error) {
      throw new Error(error.message || 'Failed to sign up')
    }
  }

  const signOut = async () => {
    await authClient.signOut()
    await refetch?.()
  }

  return (
    <AuthContext.Provider value={{ user, loading: isPending, signIn, signUp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
