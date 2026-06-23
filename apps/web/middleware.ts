import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

// Auth is now better-auth. The old middleware called supabase.auth.getUser() and
// queried user_profiles to redirect logged-in users without a profile to
// /auth/setup-profile. Profiles are now created atomically on signup (the
// databaseHooks.user.create hook in lib/auth.ts), so that redirect is obsolete.
//
// This runs on the Edge runtime, so we only do a lightweight, no-DB session
// presence check via the better-auth cookie. Pages/routes enforce real authz
// (getSessionUser / requireRole) server-side.
export function middleware(request: NextRequest) {
  // Touch the session cookie so it's available for future edge gating; no DB.
  void getSessionCookie(request);
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/tts|api/public|api/auth|record|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
