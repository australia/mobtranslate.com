import { NextRequest, NextResponse } from 'next/server';
import { readContributionPhoto } from '@/lib/country/contributions.server';

export const runtime = 'nodejs';

// Serves community photos from the data disk. Only photos of contributions
// that are still visible are served, so hiding one takes effect at once.
export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  const data = await readContributionPhoto((segments || []).join('/'));
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(data.length),
      'Cache-Control': 'public, max-age=300, must-revalidate',
    },
  });
}
