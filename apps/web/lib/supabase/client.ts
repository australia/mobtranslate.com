import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(key) {
          if (typeof document === 'undefined') return undefined
          const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`))
          return match ? decodeURIComponent(match[2]) : undefined
        },
        set(key, value, options) {
          if (typeof document === 'undefined') return
          let cookie = `${key}=${encodeURIComponent(value)}; path=${options.path || '/'}`
          if (options.maxAge) cookie += `; max-age=${options.maxAge}`
          if (options.domain) cookie += `; domain=${options.domain}`
          if (options.sameSite) cookie += `; samesite=${options.sameSite}`
          if (options.secure) cookie += `; secure`
          document.cookie = cookie
        },
        remove(key, options) {
          if (typeof document === 'undefined') return
          document.cookie = `${key}=; path=${options.path || '/'}; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0`
        },
      },
      auth: {
        // Set session to last for 1 year and auto-refresh
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'supabase.auth.token',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      }
    }
  )
}