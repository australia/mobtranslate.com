import { NextResponse } from 'next/server';

export async function GET() {
  const release = process.env.MOBTRANSLATE_RELEASE_ID?.trim();
  const sourceSha256 = process.env.MOBTRANSLATE_SOURCE_SHA256?.trim();
  return NextResponse.json({
    version: release || 'dev',
    release: release || null,
    sourceSha256: sourceSha256 || null,
    sha: process.env.MOBTRANSLATE_GIT_COMMIT?.trim() || 'local',
    environment: process.env.NODE_ENV || 'development',
    deployedAt: process.env.MOBTRANSLATE_DEPLOYED_AT || null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
