import { NextRequest, NextResponse } from 'next/server';
import { discordClientEvent } from '@/lib/discord';
import { getSessionUser } from '@/lib/auth-helpers';
import {
  apiGuardResponse,
  enforceEventRequestLimit,
} from '@/lib/api-rate-limit.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Client-only activity events the backend can't observe directly (e.g. a web or
// native-app page open, "app_opened"). Permissive but sanitized + size-capped so
// it can't be abused as a Discord-spam relay. Always fire-and-forget.

const MAX_BODY_BYTES = 4096;
const MAX_META_KEYS = 20;
const MAX_TYPE_LEN = 80;
const MAX_VALUE_LEN = 200;

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUser().catch(() => null);
  try {
    await enforceEventRequestLimit(request, sessionUser?.id ?? null);
  } catch (error) {
    const response = apiGuardResponse(error);
    if (response) return response;
    throw error;
  }

  try {
    const raw = await request.text();
    // Ignore oversized payloads outright.
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
    }

    let body: { type?: unknown; meta?: unknown };
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const type = typeof body.type === 'string' ? clip(body.type.trim(), MAX_TYPE_LEN) : '';
    if (!type) {
      return NextResponse.json({ ok: false, error: 'type is required' }, { status: 400 });
    }

    // Sanitize meta into a flat string map, capping keys + value lengths.
    const meta: Record<string, string> = {};
    if (body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)) {
      for (const [k, v] of Object.entries(body.meta as Record<string, unknown>).slice(0, MAX_META_KEYS)) {
        const key = clip(String(k), 60);
        const value = clip(typeof v === 'string' ? v : JSON.stringify(v ?? null), MAX_VALUE_LEN);
        meta[key] = value;
      }
    }

    void discordClientEvent(type, meta);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('events route error (non-fatal):', err);
    // Never surface details; this endpoint must not break clients.
    return NextResponse.json({ ok: true });
  }
}
