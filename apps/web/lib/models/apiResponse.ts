import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const API_HEADERS = {
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Cache-Control, Content-Length, ETag',
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
  'Content-Type': 'application/json; charset=utf-8',
} as const;

export function modelApiResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: API_HEADERS });
}

export function modelApiError(code: string, message: string, status: number): NextResponse {
  return modelApiResponse({
    error: { code, message, status },
  }, status);
}

export function modelApiOptions(): Response {
  return new Response(null, { status: 204, headers: API_HEADERS });
}

function httpOrigin(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function resolveModelApiOrigin(
  request: {
    headers: Pick<Headers, 'get'>;
    nextUrl: { origin: string; protocol: string };
  },
  configuredOrigin?: string,
): string {
  const configured = httpOrigin(configuredOrigin);
  if (configured) return configured;

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedHost) {
    const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const protocol = forwardedProtocol === 'http' || forwardedProtocol === 'https'
      ? forwardedProtocol
      : request.nextUrl.protocol.replace(':', '');
    const forwarded = httpOrigin(`${protocol}://${forwardedHost}`);
    if (forwarded) return forwarded;
  }

  return request.nextUrl.origin;
}

export function modelApiOrigin(request: NextRequest): string {
  return resolveModelApiOrigin(request, process.env.NEXT_PUBLIC_APP_URL);
}
