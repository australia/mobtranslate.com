import { NextResponse } from 'next/server'

// Supabase email-confirm/reset callback is gone. better-auth handles its own
// OAuth/verification callbacks under /api/auth/[...all]. This route now just
// returns users to the app.
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  return NextResponse.redirect(requestUrl.origin)
}
