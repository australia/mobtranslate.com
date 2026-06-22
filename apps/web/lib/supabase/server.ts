import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Next 15+/16: cookies() is async. @supabase/ssr 0.12: use getAll/setAll.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            const oneYear = 365 * 24 * 60 * 60 * 1000
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                maxAge: oneYear,
                expires: new Date(Date.now() + oneYear),
              })
            )
          } catch {
            // Called from a Server Component — safe to ignore when middleware
            // is refreshing user sessions.
          }
        },
      },
    }
  )
}
