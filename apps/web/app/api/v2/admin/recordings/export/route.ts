import { NextRequest, NextResponse } from 'next/server';
import { and, eq, asc } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { recordings, speakerProfiles } from '@/lib/db/schema';
import { recordingPublicUrl } from '@/lib/storage';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

// Build a training-ready manifest (LJSpeech-style) of active recordings.
// The client turns this into metadata.csv + a download script for the WAVs.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');
  const speakerId = searchParams.get('speakerId');
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 });

  const conds = [eq(recordings.languageId, languageId), eq(recordings.status, 'active')];
  if (speakerId) conds.push(eq(recordings.speakerId, speakerId));

  const rows = await db
    .select({
      id: recordings.id,
      label: recordings.label,
      durationMs: recordings.durationMs,
      sampleRate: recordings.sampleRate,
      kind: recordings.kind,
      storagePath: recordings.storagePath,
      speakerName: speakerProfiles.name,
    })
    .from(recordings)
    .leftJoin(speakerProfiles, eq(recordings.speakerId, speakerProfiles.id))
    .where(and(...conds))
    .orderBy(asc(recordings.createdAt))
    .limit(10000);

  // Build same-origin master URLs from storage_path (never the legacy absolute url).
  const withUrl = rows.map((r) => ({ ...r, masterUrl: recordingPublicUrl(r.storagePath) }));
  const filtered = withUrl.filter((r) => r.masterUrl && (r.label ?? '').trim());
  const items = filtered.map((r) => ({
    id: r.id,
    file: `${r.id}.wav`,
    text: (r.label ?? '').trim(),
    // LJSpeech "normalized" column: collapse whitespace; keep the language's orthography intact.
    normalized: (r.label ?? '').trim().replace(/\s+/g, ' '),
    duration_ms: r.durationMs,
    sample_rate: r.sampleRate,
    kind: r.kind,
    speaker: r.speakerName ?? null,
    url: r.masterUrl,
  }));

  const totalSeconds = Math.round(items.reduce((s, i) => s + (i.duration_ms ?? 0), 0) / 1000);

  return NextResponse.json({ count: items.length, totalSeconds, items });
}
