import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { applyPrivateHeaders, privateContentSecurityPolicy } from '@/lib/research/quinkan-private/security-headers';

// Auth is now better-auth. The old middleware called supabase.auth.getUser() and
// queried user_profiles to redirect logged-in users without a profile to
// /auth/setup-profile. Profiles are now created atomically on signup (the
// databaseHooks.user.create hook in lib/auth.ts), so that redirect is obsolete.
//
// This runs on the Edge runtime, so we only do a lightweight, no-DB session
// presence check via the better-auth cookie. Pages/routes enforce real authz
// (getSessionUser / requireRole) server-side.
const PRIVATE_RESEARCH_PREFIXES = ['/admin/research/quinkan/private', '/api/admin/research/quinkan/private'];

export function middleware(request: NextRequest) {
  // Touch the session cookie so it's available for future edge gating; no DB.
  void getSessionCookie(request);

  const { pathname } = request.nextUrl;
  if (PRIVATE_RESEARCH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    // The restricted workspace gets a per-request nonce CSP. Setting it on the
    // request lets Next attach the nonce to its own scripts.
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    const csp = privateContentSecurityPolicy(nonce);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    applyPrivateHeaders(response.headers);
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/tts|api/public|api/auth|record|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
