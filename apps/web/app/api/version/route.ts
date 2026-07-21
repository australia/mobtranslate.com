import { NextResponse } from 'next/server';

export async function GET() {
  const release = process.env.MOBTRANSLATE_RELEASE_ID?.trim();
  const sourceSha256 = process.env.MOBTRANSLATE_SOURCE_SHA256?.trim();
  return NextResponse.json({
    version: release || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    release: release || null,
    sourceSha256: sourceSha256 || null,
    sha: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE || '',
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'local',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    deployedAt:
      process.env.MOBTRANSLATE_DEPLOYED_AT ||
      process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE ||
      null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
