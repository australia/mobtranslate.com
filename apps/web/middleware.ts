import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          // Set cookie to expire in 1 year
          const oneYear = 365 * 24 * 60 * 60 * 1000;
          response.cookies.set({
            name,
            value,
            ...options,
            maxAge: oneYear,
            expires: new Date(Date.now() + oneYear),
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Refresh session if it exists (this will automatically handle token refresh)
  const { data: { user } } = await supabase.auth.getUser()

  // Check if user needs to set up profile
  if (user && !request.nextUrl.pathname.startsWith('/auth/setup-profile')) {
    // Skip profile check for certain paths
    const skipPaths = [
      '/auth',
      '/api',
      '/_next',
      '/favicon.ico',
      '/settings' // Settings page handles profile creation too
    ]
    
    const shouldSkip = skipPaths.some(path => request.nextUrl.pathname.startsWith(path))
    
    if (!shouldSkip) {
      // Check if user has a profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('user_id', user.id)
        .single()
      
      if (!profile) {
        // Redirect to profile setup
        return NextResponse.redirect(new URL('/auth/setup-profile', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}