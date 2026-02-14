import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
    sha: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE || '',
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'local',
    environment: process.env.VERCEL_ENV || 'development',
    deployedAt: process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE || new Date().toISOString(),
  });
}
