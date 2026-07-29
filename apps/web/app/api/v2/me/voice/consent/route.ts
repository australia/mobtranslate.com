import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Retired: a single mutable training_consent boolean cannot express the
 * purpose-specific, append-only permissions required for governed speech work.
 * Voice projects must use the speech-consent ledger and an approved studio flow.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'This legacy consent endpoint is retired. Voice-model work requires a purpose-specific governed consent record.',
    },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
